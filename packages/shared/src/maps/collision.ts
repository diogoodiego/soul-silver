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
  if (raw & BLOCKED_FLAG) return { category: "blocked", raw };
  return { ...(BEHAVIORS.get(raw & 0xff) ?? { category: "special" }), raw };
}
