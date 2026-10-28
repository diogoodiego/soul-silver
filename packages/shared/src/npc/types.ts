import type { Direction } from "../maps/areas.ts";
import type { Rng } from "../game/rng.ts";

export type { CutsceneStep, CutsceneActor } from "../game/protocol.ts";

/** How a map object behaves when no script drives it (spec 021, data-model.md). Ranges are in tiles from the origin. */
export type Pattern =
  | { kind: "still" }
  | { kind: "look"; directions: readonly Direction[] }
  | { kind: "wander"; xRange: number; yRange: number }
  | { kind: "path"; steps: readonly { dir: Direction; count: number }[] };

export interface NpcState {
  person: number;
  pattern: Pattern;
  /** Origin tile; wandering stays within the ranges around it. */
  originTx: number;
  originTy: number;
  /** Feet centre in pixels. */
  x: number;
  y: number;
  facing: Direction;
  /** Ticks left before the next decision. */
  timer: number;
  /** A walk in progress: remaining pixels to the next tile centre. */
  moving?: { dir: Direction; left: number } | undefined;
  /** Position in the path cycle and tiles already walked in that step. */
  pathStep: number;
  pathDone: number;
  rng: Rng;
}
