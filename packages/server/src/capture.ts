import { toTicks, type Point } from "@soulsilver/shared/combat";
import { BUTTON, type PlayerInput, type Rng, type ServerMessage, type WorldLookup } from "@soulsilver/shared/game";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { expForLevel } from "@soulsilver/shared/progression";
import { firstFree, store } from "@soulsilver/shared/pc";
import { canFight, type PartyMember, type Save } from "@soulsilver/shared/save";
import { ballMultiplier, ballTarget, catchValue, markCaught, markSeen, rollShakes, timeOfDay } from "@soulsilver/shared/wild";
import type { Combat } from "./combat";
import type { CombatData } from "./combat-loader";
import type { WildData } from "./wild-loader";
import type { Wilds } from "./wild";
import type { World } from "./world";

// Thrown Poké Balls (spec 015, research R8–R11): the server flies the ball, decides who hit first,
// rolls the shakes and puts the catch in the party or the first free PC slot (spec 023).

/** A player as capture sees them; the progress fields are the player's own and change in place. */
export interface Catcher {
  playerId: number;
  entityId: number;
  progress: Pick<Save, "party" | "bag" | "pokedex" | "boxes">;
  send(msg: ServerMessage): void;
}

interface State {
  catcher: Catcher;
  selected: number | undefined;
  buttons: number;
}

interface Flight {
  playerId: number;
  ball: number;
  entityId: number;
  dir: Point;
  travelled: number;
}

interface Attempt {
  playerId: number;
  wildId: number;
  ball: number;
  caught: boolean;
  resolveTick: number;
}

export interface CaptureOptions {
  data: WildData;
  wilds: Wilds;
  combat: Combat;
  combatData: CombatData;
  world: World;
  lookup: WorldLookup;
  rng: Rng;
  hour: () => number;
  /** The Pokémon the player controls in combat, if any: the ball comes from it. */
  controlled(playerId: number): number | undefined;
}

const VECTORS: Record<Direction, Point> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };
/** A ball hits a wild Pokémon whose feet are this close to its path. */
const HIT_PX = 12;
// shortcut: balls fly through walls; test the collision grid along the path if that matters in play.
/** Friendship of a catch whose species the extraction lacks (the HGSS value for most species). */
const CATCH_FRIENDSHIP = 70;

export function createCaptures(options: CaptureOptions) {
  const { data, wilds, combat, combatData, world, lookup, rng } = options;
  const { spawn: rules } = data;
  const states = new Map<number, State>();
  let flights: Flight[] = [];
  let attempts: Attempt[] = [];
  const speedPx = (rules.ballSpeedTilesPerSecond * MAP_TILE_PX) / 20;
  const rangePx = rules.throwRangeTiles * MAP_TILE_PX;
  const shakeTicks = toTicks(rules.shakeSeconds);

  const isBall = (item: number) => data.balls.balls[String(item)] !== undefined;
  const balls = (s: State) => s.catcher.progress.bag.filter((b) => isBall(b.item));
  /** The selected ball if still in the bag, else the first one. */
  const current = (s: State) => {
    const owned = balls(s);
    return owned.find((b) => b.item === s.selected)?.item ?? owned[0]?.item;
  };

  function sendBag(s: State): void {
    const selected = current(s);
    // The whole bag (spec 017): the menu shows every pocket; the client picks the balls out.
    s.catcher.send({ type: "bag", items: s.catcher.progress.bag.map((b) => ({ ...b })), ...(selected !== undefined ? { selected } : {}) });
  }

  function sendDex(s: State): void {
    const { pokedex } = s.catcher.progress;
    s.catcher.send({ type: "pokedex", seen: [...pokedex.seen], caught: [...pokedex.caught] });
  }

  function addBall(s: State, item: number, n: number): void {
    const bag = s.catcher.progress.bag;
    const entry = bag.find((b) => b.item === item);
    if (entry) entry.count += n;
    else bag.push({ item, count: n });
    s.catcher.progress.bag = bag.filter((b) => b.count > 0);
    sendBag(s);
  }

  /** Everyone whose trainer is in the area. */
  function broadcast(area: string, msg: ServerMessage): void {
    for (const s of states.values()) if (world.get(s.catcher.entityId)?.area === area) s.catcher.send(msg);
  }

  function throwBall(s: State): void {
    const { party, boxes } = s.catcher.progress;
    const item = current(s);
    if (item === undefined) {
      s.catcher.send({ type: "notice", code: "no-balls" });
      return;
    }
    if (party.length >= 6 && !firstFree(boxes)) {
      s.catcher.send({ type: "notice", code: "storage-full" });
      return;
    }
    const from = world.get(options.controlled(s.catcher.playerId) ?? s.catcher.entityId)!;
    // Aims itself at the nearest wild Pokémon in reach, else the way the thrower faces.
    const target = ballTarget(from, wilds.all().flatMap((w) => world.get(w.entityId) ?? []), rangePx);
    const d = target ? Math.hypot(target.x - from.x, target.y - from.y) : 0;
    const dir = target ? { x: (target.x - from.x) / d, y: (target.y - from.y) / d } : VECTORS[from.facing];
    const e = world.add({ kind: "projectile", area: from.area, x: from.x, y: from.y, level: from.level, facing: from.facing, data: { ball: item, owner: String(s.catcher.playerId) } });
    flights.push({ playerId: s.catcher.playerId, ball: item, entityId: e.id, dir, travelled: 0 });
    addBall(s, item, -1);
  }

  function hit(f: Flight, wildId: number, tick: number): void {
    const s = states.get(f.playerId);
    const w = wilds.get(wildId)!;
    const c = combat.get(wildId)!;
    const e = world.get(wildId)!;
    if (!s) return;
    if (w.capturing) {
      addBall(s, f.ball, 1);
      s.catcher.send({ type: "notice", code: "ball-returned" });
      return;
    }
    w.engagedTick ??= tick;
    const ball = data.balls.balls[String(f.ball)]!;
    const map = lookup(e.area);
    const user = options.controlled(f.playerId);
    const lead = s.catcher.progress.party.find(canFight);
    const mult = ballMultiplier(ball, {
      night: timeOfDay(options.hour(), rules.timeBands) === "night",
      cave: map?.areaType === "cave",
      turns: Math.floor((tick - w.engagedTick) / toTicks(rules.turnSeconds)),
      types: c.types,
      level: c.level,
      baseSpeed: combatData.species(w.species)?.baseStats.speed ?? 0,
      moonEvolver: data.moonEvolvers.has(w.species),
      caughtBefore: s.catcher.progress.pokedex.caught.includes(w.species),
      userLevel: (user !== undefined ? combat.get(user)?.level : undefined) ?? lead?.level ?? 1,
      fished: w.fished === true,
    });
    const a = ball.always ? 255 : catchValue({ hpMax: c.stats.hp, hp: c.hp, catchRate: data.catchRate(w.species) ?? 255, ball: mult, statuses: [...c.statuses.keys()] });
    const { shakes, caught } = rollShakes(a, rng);
    w.capturing = true;
    // Holds still in the ball.
    combat.input(wildId, { move: { x: 0, y: 0 }, buttons: 0 });
    attempts.push({ playerId: f.playerId, wildId, ball: f.ball, caught, resolveTick: tick + (shakes + 1) * shakeTicks });
    broadcast(e.area, { type: "capture", wildId, player: f.playerId, ball: f.ball, shakes, caught });
  }

  function resolve(a: Attempt): void {
    const s = states.get(a.playerId);
    const w = wilds.get(a.wildId);
    const c = combat.get(a.wildId);
    if (!w || !c) return;
    if (!s || !a.caught) {
      wilds.release(a.wildId, s !== undefined && rng.nextFloat() < rules.angryOnEscapeChance);
      return;
    }
    const { progress } = s.catcher;
    const info = data.species(w.species);
    const iv = () => rng.nextInt(32);
    // shortcut: IVs and nature are rolled on the catch, so the wild fought with the arena defaults; roll them on spawn if that difference shows.
    const member: PartyMember = {
      species: w.species,
      level: c.level,
      moves: c.moves.flatMap((m) => (m ? [m.id] : [])),
      // A boss's extra HP stays in the fight.
      hp: c.boss ? Math.ceil(c.hp / combatData.tuning.bossHpMul) : c.hp,
      friendship: data.balls.balls[String(a.ball)]?.friendship ?? info?.baseFriendship ?? CATCH_FRIENDSHIP,
      experience: expForLevel(info?.growthRate ?? "medium-fast", c.level),
      ivs: { hp: iv(), attack: iv(), defense: iv(), speed: iv(), specialAttack: iv(), specialDefense: iv() },
      evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 },
      nature: rng.nextInt(25),
      ...(w.shiny ? { shiny: true } : {}),
    };
    const to = progress.party.length < 6 ? "party" : "storage";
    if (to === "party") progress.party.push(member);
    else store(progress.boxes, member);
    markCaught(progress.pokedex, w.species);
    wilds.remove(a.wildId);
    s.catcher.send({ type: "captured", species: w.species, to });
    sendDex(s);
  }

  /** Moves a ball one tick; returns false once it hit something or flew its range. */
  function fly(f: Flight, tick: number): boolean {
    const e = world.get(f.entityId);
    if (!e) return false;
    const nx = e.x + f.dir.x * speedPx;
    const ny = e.y + f.dir.y * speedPx;
    for (const w of wilds.all()) {
      const we = world.get(w.entityId);
      if (!we || we.area !== e.area) continue;
      if (distToSegment(we, e, { x: nx, y: ny }) <= HIT_PX) {
        hit(f, w.entityId, tick);
        return false;
      }
    }
    f.travelled += speedPx;
    if (f.travelled >= rangePx) return false;
    world.update({ ...e, x: nx, y: ny });
    return true;
  }

  return {
    join(catcher: Catcher): void {
      const s: State = { catcher, selected: undefined, buttons: 0 };
      states.set(catcher.playerId, s);
      sendBag(s);
      sendDex(s);
    },
    /** Cancels this player's balls and shakes: the Pokémon goes back to the world. */
    leave(playerId: number): void {
      for (const f of flights.filter((f) => f.playerId === playerId)) world.remove(f.entityId);
      flights = flights.filter((f) => f.playerId !== playerId);
      for (const a of attempts.filter((a) => a.playerId === playerId)) {
        wilds.release(a.wildId, false);
      }
      attempts = attempts.filter((a) => a.playerId !== playerId);
      states.delete(playerId);
    },
    /** Sends the bag again, after the menu used an item (spec 017). */
    refresh(playerId: number): void {
      const s = states.get(playerId);
      if (s) sendBag(s);
    },
    select(playerId: number, item: number): void {
      const s = states.get(playerId);
      if (!s || !balls(s).some((b) => b.item === item)) return;
      s.selected = item;
      sendBag(s);
    },
    /** Throws on the press of the throw button, in any mode. */
    input(playerId: number, input: PlayerInput | undefined): void {
      const s = states.get(playerId);
      if (!s) return;
      const buttons = input?.buttons ?? s.buttons;
      const pressed = buttons & ~s.buttons;
      s.buttons = buttons;
      if (pressed & BUTTON.throw) throwBall(s);
    },
    /** After the wild step: balls in flight (in player order, so the lower id wins a tie), shakes, and Pokédex "seen". */
    step(tick: number): void {
      flights.sort((a, b) => a.playerId - b.playerId);
      flights = flights.filter((f) => {
        const alive = fly(f, tick);
        if (!alive) world.remove(f.entityId);
        return alive;
      });
      const due = attempts.filter((a) => tick >= a.resolveTick);
      attempts = attempts.filter((a) => tick < a.resolveTick);
      for (const a of due) resolve(a);
      for (const s of states.values()) {
        const area = world.get(s.catcher.entityId)?.area;
        let changed = false;
        for (const w of wilds.all()) if (world.get(w.entityId)?.area === area && markSeen(s.catcher.progress.pokedex, w.species)) changed = true;
        if (changed) sendDex(s);
      }
    },
  };
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export type Captures = ReturnType<typeof createCaptures>;

