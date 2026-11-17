// Item 033.3: the Blackthorn Gym's three platforms over its lava, after pokeheartgold's src/field/gymmick/blackthorn.c and
// InitBlackthornGym (src/gymmick_init.c). Each is drawn at its center (x, z) turned `rot` quarters; standing on its center
// turns it a quarter, on the tile beside the center it moves its own width that way, carrying the player. A move goes all
// the way or not at all (the original bonks back), a turn only when nothing but lava is in its sweep.

export interface BlackthornPlatformState {
  x: number;
  z: number;
  rot: number;
}

export type BlackthornGymState = BlackthornPlatformState[];

type Point = { x: number; z: number };

export const BLACKTHORN_START: BlackthornGymState = [
  { x: 13, z: 75, rot: 0 },
  { x: 9, z: 58, rot: 1 },
  { x: 14, z: 32, rot: 0 },
];

/** Steps of direction 0 to 3: east, south, west, north (BlackthornGymmick_DirectionToVec). */
const STEPS: Point[] = [
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
];

// When a point of the turn's sweep is not lava, the 1/256 of the quarter turn the platform gets before it bonks; 64 is the
// whole turn (sMainAreaRotationExtents, sLeadingEdgeRotationExtents).
const SWEEP = [
  [10, 10, 13, 18, 25, 38, 51, 64, 64, 23, 28, 35, 45, 55],
  [8, 9, 10, 14, 19, 26, 37, 51, 64, 17, 19, 23, 28, 35, 46, 55, 64, 64, 64, 30, 35, 41, 49, 57],
];
const EDGE = [
  [64, 64, 64, 64, 42],
  [64, 20, 30, 46],
];

/** Point (x + dx, z + dz) turned `rot` quarters around (x, z) (BlackthornGymmick_ApplyRotationToPoints). */
function turned(rot: number, x: number, z: number, dx: number, dz: number): Point {
  const [rx, rz] = [[dx, dz], [-dz, dx], [-dx, -dz], [dz, -dx]][rot % 4]!;
  return { x: x + rx!, z: z + rz! };
}

/** Platform `index` (0 and 2 are 5 by 7, 1 is 4 by 8) where `p` puts it: its buttons, floor and the tiles its moves and turns check. */
export function blackthornPlatform(index: number, p: BlackthornPlatformState) {
  const small = index !== 1;
  const width = small ? 5 : 4;
  const height = small ? 7 : 8;
  const at = (dx: number, dz: number) => turned(p.rot, p.x, p.z, dx, dz);
  const line = (n: number, f: (i: number) => [number, number]) => Array.from({ length: n }, (_, i) => at(...f(i)));
  return {
    width,
    height,
    shape: small ? 0 : 1,
    // The rotate button is the center, never turned.
    rotate: { x: p.x, z: p.z },
    forward: at(1, 0),
    back: at(-1, 0),
    rightWall: line(height, (i) => [small ? 3 : 2, -2 + i]),
    leftWall: line(height, (i) => [-3, -2 + i]),
    bottomWall: line(width, (i) => [-2 + i, small ? 5 : 6]),
    topWall: line(width, (i) => [-2 + i, -3]),
    sweep: small ? line(14, (k) => [-4 - Math.floor(k / 7), 4 - (k % 7)]) : line(24, (k) => [-4 - Math.floor(k / 8), 5 - (k % 8)]),
    edge: line(width, (i) => [3, -2 + i]),
    floor: line(18, (k) => [-1 + (k % 3), -1 + Math.floor(k / 3)]),
  };
}

/** Whether (x, z) is the floor of a platform. */
export function blackthornFloor(state: BlackthornGymState, x: number, z: number): boolean {
  return state.some((p, i) => blackthornPlatform(i, p).floor.some((f) => f.x === x && f.z === z));
}

/**
 * The player stepping onto (x, z): undefined when it is no button; else the platforms after the press and how far the player
 * was carried. `wall` is what stops a platform: a tile that blocks, or one that is not lava (BlackthornGymmick_CheckWallCollision).
 */
export function blackthornPress(state: BlackthornGymState, x: number, z: number, wall: (x: number, z: number) => boolean): { state: BlackthornGymState; dx: number; dz: number } | undefined {
  const index = state.findIndex((p, i) => {
    const b = blackthornPlatform(i, p);
    return [b.rotate, b.forward, b.back].some((q) => q.x === x && q.z === z);
  });
  if (index === -1) return undefined;
  const p = state[index]!;
  const b = blackthornPlatform(index, p);
  const same = { state, dx: 0, dz: 0 };
  const any = (points: Point[]) => points.some((q) => wall(q.x, q.z));
  const replaced = (next: BlackthornPlatformState) => state.map((q, i) => (i === index ? next : q));
  if (b.rotate.x === x && b.rotate.z === z) {
    if (any(b.bottomWall) || any(b.topWall) || any(b.leftWall) || any(b.rightWall.slice(0, b.width - 1))) return same;
    const bonks = (points: Point[], extents: number[]) => points.some((q, i) => extents[i]! < 64 && wall(q.x, q.z));
    if (bonks(b.sweep, SWEEP[b.shape]!) || bonks(b.edge, EDGE[b.shape]!)) return same;
    return { state: replaced({ ...p, rot: (p.rot + 1) % 4 }), dx: 0, dz: 0 };
  }
  const forward = b.forward.x === x && b.forward.z === z;
  const step = STEPS[((forward ? 0 : 2) + p.rot) % 4]!;
  const leading = forward ? b.rightWall : b.leftWall;
  for (let s = 0; s < b.width; s++) if (leading.some((q) => wall(q.x + step.x * s, q.z + step.z * s))) return same;
  const [dx, dz] = [step.x * b.width, step.z * b.width];
  return { state: replaced({ ...p, x: p.x + dx, z: p.z + dz }), dx, dz };
}
