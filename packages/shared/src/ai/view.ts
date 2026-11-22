import type { Behavior, Hitbox } from "../combat/schemas.ts";
import type { Rng } from "../game/rng.ts";

// What the AI may know (spec 019, research R3): its own Pokémon in full, and of everyone else only
// what a player could see on screen. Opponents carry no cooldowns; perception decides which of the
// candidates it actually sees.

export interface Point {
  x: number;
  y: number;
}

export interface MoveView {
  /** Block C: its slot (0–1 normal, 2–3 special); empty slots have no view. */
  slot: number;
  id: number;
  behavior: Behavior;
  type: number;
  category: "physical" | "special" | "status";
  power: number;
  rangePx: number;
  hitbox: Hitbox | undefined;
  /** Projectile and dash speed, px per second. */
  speedPx: number;
  /** Block C: off cooldown (a normal move's: only after missing the first of a chain). */
  ready: boolean;
  /** Block C: a special (cooldown, red warning: only dodged). */
  special: boolean;
  damages: boolean;
  /** Inflicts a status on the target. */
  status: boolean;
  /** Raises the user's stats. */
  buff: boolean;
  /** Lowers the target's stats. */
  debuff: boolean;
  heals: boolean;
}

export interface SelfView extends Point {
  id: number;
  types: number[];
  level: number;
  attack: number;
  specialAttack: number;
  hp: number;
  hpMax: number;
  /** Asleep or frozen. */
  immobile: boolean;
  /** A move failed on it this tick (paralysis, flinch). */
  stunned: boolean;
  casting: boolean;
  moves: MoveView[];
}

/** A cast the opponent shows: where it faces and how far it reaches. */
export interface CastView {
  dir: Point;
  reachPx: number;
  /** Ticks since it began; the AI reacts only after its reaction time. */
  elapsedTicks: number;
  /** Block C: ticks until it lands, and whether it is a special (red: it cannot be parried). */
  leftTicks: number;
  special: boolean;
}

export interface OpponentView extends Point {
  id: number;
  /** A trainer can be chased but not hurt. */
  kind: "trainer" | "pokemon";
  types: number[];
  defense: number;
  specialDefense: number;
  hp: number;
  hpMax: number;
  hasStatus: boolean;
  casting: CastView | undefined;
}

export interface NoiseEvent extends Point {
  sourceId: number;
  radiusPx: number;
}

/** One tick of input to a controller. */
export interface AiTick {
  tick: number;
  self: SelfView;
  /** Opponents in the area: candidates for perception, not what it knows. */
  opponents: OpponentView[];
  noises: NoiseEvent[];
  /** Damage taken this tick, by attacker. */
  hurtBy: { id: number; amount: number }[];
}

/** The world as the AI can probe it. */
export interface AiEnv {
  rng: Rng;
  /** Line of sight between two points on the AI's map. */
  sees: (a: Point, b: Point) => boolean;
  /** Whether the AI can stand there: not water, ledge, wall or off the map. */
  walkable: (p: Point) => boolean;
  /** Type multiplier of a move type against the defender's types. */
  effectiveness: (moveType: number, types: readonly number[]) => number;
}

/** The input a controller produces: exactly what a player's client sends to combat. */
export interface AiInput {
  move: Point;
  buttons: number;
  aim: Point | undefined;
}

export interface MoveScore {
  slot: number;
  move: number;
  damage: number;
  hit: number;
  utility: number;
  score: number;
}

/** One logged decision: a move choice or a state change. */
export interface Decision {
  tick: number;
  entityId: number;
  state: string;
  target: number | undefined;
  scores: MoveScore[];
  chosenSlot: number | undefined;
}

/** Decision points the trainers spec fills in; they do nothing for wild Pokémon. */
export interface AiHooks {
  chooseSwitch?(tick: AiTick): number | undefined;
  chooseItem?(tick: AiTick): number | undefined;
}
