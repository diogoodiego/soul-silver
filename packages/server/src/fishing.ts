import { castLine, reel, stepFishing, type Fishing, type FishingRules, type PlayerMode, type Rod } from "@soulsilver/shared/field";
import { surfable, tileAt, type Rng, type ServerMessage, type WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import type { Save } from "@soulsilver/shared/save";
import type { World } from "./world";

// Fishing (spec 025, research R4): the line's state lives here, on the session's tick clock and Rng;
// the client only asks to cast and to reel, and draws what it is told.

export interface Angler {
  playerId: number;
  entityId: number;
  progress: Pick<Save, "bag">;
  send(msg: ServerMessage): void;
}

export interface FishingOptions {
  rules: FishingRules;
  world: World;
  lookup: WorldLookup;
  rng: Rng;
  /** In combat, a script, a menu or a trainer's sight: no casting. */
  busy(playerId: number): boolean;
  /** The companion out of its ball's friendship; 0 without one (FR-011). */
  friendship(playerId: number): number;
  mode(playerId: number): PlayerMode;
  setMode(playerId: number, mode: PlayerMode): void;
  canFish(area: string, rod: Rod): boolean;
  /** Puts the hooked Pokémon at (x, y) on the water. */
  hook(area: string, rod: Rod, x: number, y: number, tick: number): void;
}

const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const center = (t: number) => t * MAP_TILE_PX + MAP_TILE_PX / 2;

export function createFishing(options: FishingOptions) {
  const { rules, world, lookup, rng } = options;
  const anglers = new Map<number, Angler>();
  const lines = new Map<number, Fishing & { area: string; tx: number; ty: number; fish: boolean }>();

  const refuse = (a: Angler, reason: Extract<ServerMessage, { type: "field-result" }>["reason"]) => a.send({ type: "field-result", ok: false, reason });

  /** The line is out: hooked puts the fish on the water; either way the angler walks again. */
  function end(a: Angler, line: Fishing & { area: string; tx: number; ty: number }, tick: number): void {
    lines.delete(a.playerId);
    const e = world.get(a.entityId);
    if (line.state === "hooked" && e?.area === line.area) options.hook(e.area, line.rod, center(line.tx), center(line.ty), tick);
    a.send({ type: "field-fishing", state: line.state as "hooked" | "escaped" });
    options.setMode(a.playerId, "walk");
  }

  return {
    join(a: Angler): void {
      anglers.set(a.playerId, a);
    },
    leave(playerId: number): void {
      anglers.delete(playerId);
      lines.delete(playerId);
    },
    /** A cast at the water the player faces, with that rod in the bag (FR-010). */
    fish(playerId: number, rod: Rod, tick: number): void {
      const a = anglers.get(playerId);
      const e = a && world.get(a.entityId);
      if (!a || !e) return;
      // shortcut: no fishing from the water, the mode holds one of surf or fish; keep the line apart from the mode if that is wanted.
      if (options.mode(playerId) !== "walk" || options.busy(playerId) || e.data["hop"] !== undefined || e.data["warping"] !== undefined) return refuse(a, "busy");
      if (!a.progress.bag.some((b) => b.item === rules.rods[rod].item && b.count > 0)) return refuse(a, "notAllowed");
      const [dx, dy] = STEP[e.facing];
      const tx = Math.floor(e.x / MAP_TILE_PX) + dx;
      const ty = Math.floor(e.y / MAP_TILE_PX) + dy;
      if (!surfable(tileAt(lookup, e.area, e.level, center(tx), center(ty)))) return refuse(a, "notHere");
      lines.set(playerId, { ...castLine(rules, rod, tick, rng), area: e.area, tx, ty, fish: options.canFish(e.area, rod) });
      options.setMode(playerId, "fish");
      a.send({ type: "field-fishing", state: "waiting" });
    },
    /** The reaction button: in the window it hooks, otherwise it reels in an empty line. */
    reel(playerId: number, tick: number): void {
      const a = anglers.get(playerId);
      const line = lines.get(playerId);
      if (a && line) end(a, { ...line, ...reel(line, tick) }, tick);
    },
    step(tick: number): void {
      for (const [id, line] of lines) {
        const a = anglers.get(id)!;
        // A warp or a rescue pulls the line out; a map with no fish for this rod never bites ("not even a nibble").
        const moved = world.get(a.entityId)?.area !== line.area;
        if (moved || (!line.fish && tick >= line.deadline)) {
          end(a, { ...line, state: "escaped" }, tick);
          continue;
        }
        const next = stepFishing(line, rules, options.friendship(id), tick, rng);
        if (next === line) continue;
        if (next.state === "bite") {
          lines.set(id, { ...line, ...next });
          a.send({ type: "field-fishing", state: "bite", windowMs: Math.round(rules.rods[line.rod].windowS * 1000) });
        } else end(a, { ...line, ...next }, tick);
      }
    },
  };
}

export type FishingControl = ReturnType<typeof createFishing>;
