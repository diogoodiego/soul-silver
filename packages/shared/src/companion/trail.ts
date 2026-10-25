import type { Direction } from "../maps/areas.ts";

// The companion's trail (spec 014, research R1): the trainer's recent positions, newest last. The
// companion stands a fixed path length back, so it only ever stands where the trainer stood.

export interface Pose {
  area: string;
  x: number;
  y: number;
  level: number;
  facing: Direction;
  /** The trainer's ledge hop counter at this point (0 when walking). */
  hop: number;
}

const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
const length = (a: Pose, b: Pose) => Math.hypot(b.x - a.x, b.y - a.y);
const heading = (from: Pose, to: Pose): Direction =>
  Math.abs(to.x - from.x) > Math.abs(to.y - from.y) ? (to.x > from.x ? "east" : "west") : to.y > from.y ? "south" : "north";

/** Records a trainer pose; standing still adds nothing, another map starts over, and only `keepPx` of path is kept. */
export function pushPose(trail: Pose[], pose: Pose, keepPx: number): void {
  const last = trail.at(-1);
  if (last && last.area !== pose.area) trail.length = 0;
  else if (last && last.x === pose.x && last.y === pose.y) return;
  trail.push(pose);
  let total = 0;
  for (let i = trail.length - 1; i > 0; i--) {
    total += length(trail[i - 1]!, trail[i]!);
    if (total >= keepPx) {
      trail.splice(0, i - 1);
      return;
    }
  }
}

/** The point `backPx` along the trail from its newest end, facing the way it was walked; undefined with no path yet. */
export function poseAt(trail: readonly Pose[], backPx: number): Pose | undefined {
  if (trail.length < 2) return undefined;
  let left = backPx;
  for (let i = trail.length - 1; i > 0; i--) {
    const to = trail[i]!;
    const from = trail[i - 1]!;
    const seg = length(from, to);
    if (seg >= left || i === 1) {
      const t = seg === 0 ? 0 : Math.max(0, 1 - left / seg);
      return { ...from, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, facing: heading(from, to), hop: Math.max(from.hop, to.hop) };
    }
    left -= seg;
  }
  return undefined;
}

/** `distPx` behind the pose, or the pose itself when `free` says that spot is blocked. */
export function behind(pose: Pose, distPx: number, free: (x: number, y: number) => boolean): Pose {
  const [sx, sy] = STEP[pose.facing];
  const x = pose.x - sx * distPx;
  const y = pose.y - sy * distPx;
  return free(x, y) ? { ...pose, x, y, hop: 0 } : { ...pose, hop: 0 };
}
