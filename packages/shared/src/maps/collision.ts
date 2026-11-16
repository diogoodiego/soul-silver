// Tile permission -> collision category; table in specs/006-map-prerender/research.md R6.
// Low byte is the tile behavior, high byte holds flags (0x80 = blocked).

export type CollisionCategory =
  | "blocked"
  | "free"
  | "tallGrass"
  | "water"
  | "ledge"
  | "ladder"
  | "levelTransition"
  | "special";

export type LedgeDirection = "north" | "south" | "east" | "west";

export interface CollisionCell {
  category: CollisionCategory;
  /** Original permission value, always preserved. */
  raw: number;
  /** Only for "ledge". */
  direction?: LedgeDirection;
  /** Only for "levelTransition". */
  targetLevel?: number;
}

const BLOCKED_FLAG = 0x8000;
/** Shop and Pokémon Center counters: talking to one reaches the tile behind it (spec 023). */
const COUNTER_BEHAVIOR = 0x80;

export const isCounter = (cell: CollisionCell | undefined) => cell !== undefined && (cell.raw & 0xff) === COUNTER_BEHAVIOR;
/** A Pokémon Center or house PC: talking to it runs the PC script (spec 023). */
const PC_BEHAVIOR = 0x83;
export const isPc = (cell: CollisionCell | undefined) => cell !== undefined && (cell.raw & 0xff) === PC_BEHAVIOR;
/** A rock-climb wall (spec 025): a wall to walking, crossed only by Rock Climb; the ROM leaves it without the blocked flag. */
export const isRockClimb = (cell: CollisionCell | undefined) => cell !== undefined && ((cell.raw & 0xff) === 0x4b || (cell.raw & 0xff) === 0x4c);
/** Ice (item 032.6): the feet slide on over it; its rocks are ice tiles with the blocked flag (0x8020). */
export const isIce = (cell: CollisionCell | undefined) => cell !== undefined && cell.category !== "blocked" && (cell.raw & 0xff) === 0x20;

const BEHAVIORS: ReadonlyMap<number, Omit<CollisionCell, "raw">> = new Map([
  [0x00, { category: "free" }],
  [0x02, { category: "tallGrass" }],
  [0x03, { category: "tallGrass" }],
  [0x10, { category: "water" }],
  [0x11, { category: "water" }],
  [0x13, { category: "water" }],
  [0x15, { category: "water" }],
  [0x38, { category: "ledge", direction: "east" }],
  [0x39, { category: "ledge", direction: "west" }],
  [0x3a, { category: "ledge", direction: "north" }],
  [0x3b, { category: "ledge", direction: "south" }],
]);

export function classifyPermission(raw: number): CollisionCell {
  const known = BEHAVIORS.get(raw & 0xff);
  // Ledges carry the blocked flag in the ROM (0x803B); the hop is what lets them be crossed.
  if (known?.category === "ledge") return { ...known, raw };
  if (raw & BLOCKED_FLAG) return { category: "blocked", raw };
  return { ...(known ?? { category: "special" }), raw };
}
