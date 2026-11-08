import { canUseFieldMove, canUseNamedMove, launchAllowed, parseFieldFile, type FieldFileKind, type FieldMovesRules, type FishingRules, type LocomotionClass, type PlayerMode } from "@soulsilver/shared/field";
import { leadIndex } from "@soulsilver/shared/companion";
import { surfable, tileAt, unstick, type ServerMessage, type WorldLookup } from "@soulsilver/shared/game";
import type { FlyPointsFile } from "@soulsilver/shared/events";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import type { Save } from "@soulsilver/shared/save";
import fishingJson from "../../../content/field/fishing.json" with { type: "json" };
import movesJson from "../../../content/field/moves.json" with { type: "json" };
import locomotionJson from "../../../content/species/locomotion.json" with { type: "json" };
import type { World } from "./world";

// Field moves and locomotion (spec 025): the player's mode, decided and validated here; the mode
// rides on the player's entity (`data.mode`) so movement and every client see it.

export interface FieldData {
  rules: FieldMovesRules;
  fishing: FishingRules;
  /** Terrestrial for a species outside the table (synthetic test species). */
  locomotion(species: number): LocomotionClass;
}

function parse<K extends FieldFileKind>(kind: K, value: unknown, file: string) {
  const result = parseFieldFile(kind, value, file);
  if (!result.ok) throw new Error(`${result.error.file}: ${result.error.path}: ${result.error.problem}`);
  return result.data.value;
}

export function buildFieldData(content: { moves: unknown; fishing: unknown; locomotion: unknown } = { moves: movesJson, fishing: fishingJson, locomotion: locomotionJson }): FieldData {
  const rules = parse("moves", content.moves, "content/field/moves.json") as FieldMovesRules;
  const fishing = parse("fishing", content.fishing, "content/field/fishing.json") as FishingRules;
  const table = (parse("locomotion", content.locomotion, "content/species/locomotion.json") as { species: Record<string, LocomotionClass> }).species;
  return { rules, fishing, locomotion: (species) => table[String(species)] ?? "terrestrial" };
}

let bundled: FieldData | undefined;
/** content/field and content/species as bundled with the app, parsed once. */
export const bundledFieldData = () => (bundled ??= buildFieldData());

export interface Rider {
  playerId: number;
  entityId: number;
  progress: Pick<Save, "party" | "badgeSet" | "bag" | "flyPoints" | "escape">;
  send(msg: ServerMessage): void;
}

export interface FieldOptions {
  data: FieldData;
  world: World;
  lookup: WorldLookup;
  /** In combat, in a script, a menu or a trainer's sight: no mounting. */
  busy(playerId: number): boolean;
  /** The cities Fly reaches (extracted `fly-points.json`). */
  flyPoints: FlyPointsFile["points"];
  /** The last Pokémon Center, where Teleport goes. */
  home(playerId: number): { area: string; x: number; y: number };
}

const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const LAND_WALLS = new Set(["water", "blocked", "ledge"]);
const OPPOSITE: Record<Direction, Direction> = { north: "south", south: "north", east: "west", west: "east" };
const center = (t: number) => t * MAP_TILE_PX + MAP_TILE_PX / 2;

export function createField(options: FieldOptions) {
  const { data, world, lookup } = options;
  const riders = new Map<number, Rider>();

  const modeOf = (r: Rider): PlayerMode => (world.get(r.entityId)?.data["mode"] as PlayerMode | undefined) ?? "walk";
  const refuse = (r: Rider, reason: Extract<ServerMessage, { type: "field-result" }>["reason"]) => r.send({ type: "field-result", ok: false, reason });

  /** The tile the player faces, in tile coordinates of their map. */
  function ahead(r: Rider) {
    const e = world.get(r.entityId)!;
    const [dx, dy] = STEP[e.facing];
    const tx = Math.floor(e.x / MAP_TILE_PX) + dx;
    const ty = Math.floor(e.y / MAP_TILE_PX) + dy;
    return { e, tx, ty, cell: tileAt(lookup, e.area, e.level, center(tx), center(ty)), here: tileAt(lookup, e.area, e.level, e.x, e.y) };
  }

  function setMode(r: Rider, mode: PlayerMode, at?: { tx: number; ty: number }): void {
    const e = world.get(r.entityId)!;
    const rest = { ...e.data };
    delete rest["mode"];
    delete rest["speed"];
    const next = mode === "walk" ? rest : mode === "bike" ? { ...rest, mode, speed: data.rules.bikeSpeedPx } : { ...rest, mode };
    world.update({ ...e, ...(at ? { x: center(at.tx), y: center(at.ty) } : {}), data: next });
    r.send({ type: "player-mode", mode });
  }

  const mapOf = (r: Rider) => lookup(world.get(r.entityId)?.area ?? "");
  /** The header's permissions (map_header.h); a map without one (tests, the arena) goes by its area type. Teleport, a way out of caves here, follows the Escape Rope. */
  function permits(r: Rider, what: "bike" | "fly" | "escape"): boolean {
    const map = mapOf(r);
    if (what === "bike") return map?.bikeAllowed ?? map?.areaType === "outdoor";
    if (what === "fly") return map?.flyAllowed ?? map?.areaType === "outdoor";
    return map?.escapeRopeAllowed ?? map?.areaType === "cave";
  }
  const dark = (r: Rider) => data.rules.darkWeather.includes(mapOf(r)?.weather ?? -1);

  /** Somewhere else on the field: a fly point, out of a cave or to the Pokémon Center. */
  function relocate(r: Rider, area: string, x: number, y: number, facing: Direction): void {
    const e = world.get(r.entityId)!;
    const rest = { ...e.data };
    delete rest["hop"];
    delete rest["warping"];
    world.update(unstick({ ...e, area, x, y, level: 0, facing, data: rest }, lookup));
    r.send({ type: "field-result", ok: true });
  }

  /** Out of a cave (FR-017): Dig and Escape Rope by the way in, Teleport to the Pokémon Center. */
  function escape(r: Rider, by: "dig" | "rope" | "teleport"): void {
    const out = by === "teleport" ? undefined : r.progress.escape;
    // An older save loaded inside a cave never recorded the way in: the Pokémon Center instead.
    if (out) return relocate(r, out.area, out.x, out.y, OPPOSITE[out.facing]);
    const home = options.home(r.playerId);
    relocate(r, home.area, home.x, home.y, "south");
  }

  /** What the field remembers of a player for this session only. */
  const states = new Map<number, { area?: string; lit: boolean; launchable?: string }>();
  const state = (r: Rider) => states.get(r.playerId) ?? states.set(r.playerId, { lit: false }).get(r.playerId)!;
  // Field moves work on foot, on the bicycle and from the water, as in the original; a landing on land ends the surf (step). Not while fishing.
  const ready = (r: Rider) => !options.busy(r.playerId) && modeOf(r) !== "fish";

  const launchableOf = (r: Rider) => r.progress.party.map((m) => launchAllowed(data.locomotion(m.species), modeOf(r)));
  function sendLaunchable(r: Rider): void {
    const launchable = launchableOf(r);
    state(r).launchable = launchable.join();
    r.send({ type: "field-launchable", launchable });
  }

  return {
    join(r: Rider): void {
      riders.set(r.playerId, r);
    },
    leave(playerId: number): void {
      riders.delete(playerId);
      states.delete(playerId);
    },
    busy: (playerId: number) => options.busy(playerId),
    mode: (playerId: number): PlayerMode => {
      const r = riders.get(playerId);
      return r ? modeOf(r) : "walk";
    },
    /** For fishing, which validates its own start. */
    setMode(playerId: number, mode: PlayerMode): void {
      const r = riders.get(playerId);
      if (r) setMode(r, mode);
    },
    surfing: (playerId: number) => {
      const r = riders.get(playerId);
      return !!r && modeOf(r) === "surf";
    },
    /** On the water or the bicycle, the companion rides in its ball. */
    riding: (playerId: number) => {
      const r = riders.get(playerId);
      return !!r && (modeOf(r) === "surf" || modeOf(r) === "bike");
    },
    /** Whether this species may be sent out now (FR-008). */
    launchable(playerId: number, species: number): boolean {
      const r = riders.get(playerId);
      return !r || launchAllowed(data.locomotion(species), modeOf(r));
    },
    /** Surf from the water's edge, with the move in the party and the badge (FR-006, FR-009); the bicycle outdoors, with it in the bag (FR-014). */
    mount(playerId: number, mode: "bike" | "surf"): void {
      const r = riders.get(playerId);
      if (!r) return;
      const { e, tx, ty, cell, here } = ahead(r);
      if (modeOf(r) !== "walk" || options.busy(playerId) || e.data["hop"] !== undefined || e.data["warping"] !== undefined) return refuse(r, "busy");
      if (mode === "bike") {
        if (!permits(r, "bike")) return refuse(r, "indoors");
        if (!r.progress.bag.some((b) => b.item === data.rules.bicycle && b.count > 0)) return refuse(r, "notAllowed");
        setMode(r, "bike");
        return r.send({ type: "field-result", ok: true });
      }
      if (!surfable(cell) || here?.category === "water") return refuse(r, "notHere");
      const check = canUseFieldMove(data.rules, r.progress.badgeSet, r.progress.party, "water", leadIndex(r.progress.party));
      if (!check.ok) return refuse(r, check.reason);
      setMode(r, "surf", { tx, ty });
      r.send({ type: "field-result", ok: true });
      sendLaunchable(r);
    },
    /** Off the bicycle where the player stands; off the water onto the land the player faces. */
    dismount(playerId: number): void {
      const r = riders.get(playerId);
      if (!r) return;
      if (modeOf(r) !== "surf" && modeOf(r) !== "bike") return refuse(r, "notAllowed");
      if (options.busy(playerId)) return refuse(r, "busy");
      if (modeOf(r) === "bike") {
        setMode(r, "walk");
        return r.send({ type: "field-result", ok: true });
      }
      const { tx, ty, cell } = ahead(r);
      if (!cell || LAND_WALLS.has(cell.category)) return refuse(r, "notHere");
      setMode(r, "walk", { tx, ty });
      r.send({ type: "field-result", ok: true });
    },
    /** A field move from the menu: Fly opens the map, Flash lights a dark cave, Dig and Teleport leave one (FR-015–FR-017). */
    use(playerId: number, move: string): void {
      const r = riders.get(playerId);
      if (!r) return;
      if (!ready(r)) return refuse(r, "busy");
      const place = move === "fly" ? permits(r, "fly") : move === "flash" ? dark(r) : move === "dig" || move === "teleport" ? permits(r, "escape") : undefined;
      if (place === undefined) return refuse(r, "notAllowed");
      if (!place) return refuse(r, "notHere");
      const check = canUseNamedMove(data.rules, r.progress.badgeSet, r.progress.party, move, leadIndex(r.progress.party));
      if (!check.ok) return refuse(r, check.reason);
      if (move === "fly") {
        const visited = new Set(r.progress.flyPoints);
        return r.send({ type: "field-fly-map", points: options.flyPoints.filter((p) => visited.has(String(p.map))).map((p) => ({ area: String(p.map), flypoint: p.flypoint })) });
      }
      if (move === "flash") {
        state(r).lit = true;
        r.send({ type: "field-lit", lit: true });
        return r.send({ type: "field-result", ok: true });
      }
      escape(r, move as "dig" | "teleport");
    },
    /** The destination picked on the Fly map: only a fly point this player has visited. */
    fly(playerId: number, area: string): void {
      const r = riders.get(playerId);
      if (!r) return;
      if (!ready(r)) return refuse(r, "busy");
      const point = options.flyPoints.find((p) => String(p.map) === area);
      const dest = point && lookup(area);
      if (!point || !dest || !r.progress.flyPoints.includes(area)) return refuse(r, "notVisited");
      if (!permits(r, "fly")) return refuse(r, "notHere");
      const check = canUseNamedMove(data.rules, r.progress.badgeSet, r.progress.party, "fly", leadIndex(r.progress.party));
      if (!check.ok) return refuse(r, check.reason);
      const o = dest.origin ?? { tx: 0, ty: 0 };
      relocate(r, area, center(point.tx - o.tx), center(point.ty - o.ty), "south");
    },
    /** The Escape Rope from the bag; true when it was used (the caller takes it out of the bag). */
    escapeRope(playerId: number): boolean {
      const r = riders.get(playerId);
      if (!r) return false;
      if (!ready(r)) return (refuse(r, "busy"), false);
      if (!permits(r, "escape")) return (refuse(r, "notHere"), false);
      escape(r, "rope");
      return true;
    },
    /**
     * A warp, a rescue or a blackout that leaves a surfer on land ends the surf, and one indoors gets
     * off the bicycle; a new map puts out the Flash and records a fly point; the last spot outdoors is
     * the way back out of a cave.
     */
    step(): void {
      for (const r of riders.values()) {
        const e = world.get(r.entityId);
        if (!e || e.data["warping"] !== undefined) continue;
        const map = lookup(e.area);
        if (modeOf(r) === "surf" && tileAt(lookup, e.area, e.level, e.x, e.y)?.category !== "water") setMode(r, "walk");
        if (modeOf(r) === "bike" && !permits(r, "bike")) setMode(r, "walk");
        const s = state(r);
        // A capture, a faint, a swap or a new order on the water changes who may be sent out (FR-008).
        if (modeOf(r) === "surf" && launchableOf(r).join() !== s.launchable) sendLaunchable(r);
        if (s.area !== e.area) {
          s.area = e.area;
          if (s.lit) r.send({ type: "field-lit", lit: (s.lit = false) });
          if (options.flyPoints.some((p) => String(p.map) === e.area) && !r.progress.flyPoints.includes(e.area)) r.progress.flyPoints.push(e.area);
        }
        // Kept in the save, so Dig and the Escape Rope find the way out after a reload too.
        if (map?.areaType === "outdoor") r.progress.escape = { area: e.area, x: e.x, y: e.y, facing: e.facing };
      }
    },
  };
}

export type Field = ReturnType<typeof createField>;
