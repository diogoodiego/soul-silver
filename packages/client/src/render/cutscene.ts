// Stages a cutscene request on this client (spec 021): where each actor stands and where the camera
// looks, as a pure function of the time since it began. The server only learns that it ended.
import type { CutsceneActor, CutsceneStep } from "@soulsilver/shared/game";
import { MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";

/** A normal walk in the original: 8 frames at 30 fps per tile. */
export const WALK_MS_PER_TILE = 267;
const TICK_MS = 50;
const STEP: Record<Direction, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const SHAKE_WAVES = 12;

export interface Pose {
  x: number;
  y: number;
  facing: Direction;
  visible: boolean;
  moving: boolean;
}

export const actorKey = (a: CutsceneActor): string => (typeof a === "string" ? a : `p${a.person}`);

/** How long a step holds the scene, in ms. */
function durationOf(s: CutsceneStep): number {
  switch (s.kind) {
    case "walk":
    case "jump":
      return s.count * WALK_MS_PER_TILE;
    case "wait":
    case "camera-move":
    case "camera-shake":
      return s.ticks * TICK_MS;
    default:
      return 0;
  }
}

export interface Staged {
  poses: Map<string, Pose>;
  /** The point the camera centres on, before clampCamera; shake included. */
  focus: { x: number; y: number };
  done: boolean;
}

/** `start` holds every actor's pose when the scene began; the camera starts on "player". */
export function stage(steps: readonly CutsceneStep[], start: ReadonlyMap<string, Pose>, ms: number): Staged {
  const poses = new Map([...start].map(([k, p]) => [k, { ...p, moving: false }]));
  const pose = (a: CutsceneActor) => poses.get(actorKey(a));
  let camera: { follow: string } | { x: number; y: number } = { follow: "player" };
  const focusNow = () => ("follow" in camera ? (poses.get(camera.follow) ?? { x: 0, y: 0 }) : camera);
  let shake = { x: 0, y: 0 };
  let t = 0;
  for (const s of steps) {
    const d = durationOf(s);
    const p = Math.min(1, d === 0 ? 1 : Math.max(0, ms - t) / d);
    switch (s.kind) {
      case "walk":
      case "jump": {
        const a = pose(s.actor);
        if (!a) break;
        const px = s.count * MAP_TILE_PX * p;
        a.x += STEP[s.dir][0] * px;
        a.y += STEP[s.dir][1] * px;
        a.facing = s.dir;
        a.moving = p < 1;
        break;
      }
      case "face": {
        const a = pose(s.actor);
        if (a) a.facing = s.dir;
        break;
      }
      case "show":
      case "hide": {
        const a = pose(s.actor);
        if (a) a.visible = s.kind === "show";
        break;
      }
      case "camera-move": {
        const from = focusNow();
        camera = { x: from.x + (s.x - from.x) * p, y: from.y + (s.y - from.y) * p };
        break;
      }
      case "camera-lock":
        camera = { follow: actorKey(s.actor) };
        break;
      case "camera-release":
        camera = { follow: "player" };
        break;
      case "camera-shake": {
        const amp = s.amplitude * (1 - p);
        shake = p < 1 ? { x: amp * Math.sin(p * SHAKE_WAVES * Math.PI * 2), y: 0 } : { x: 0, y: 0 };
        break;
      }
      case "wait":
        break;
    }
    if (ms < t + d) {
      const f = focusNow();
      return { poses, focus: { x: f.x + shake.x, y: f.y + shake.y }, done: false };
    }
    t += d;
  }
  const f = focusNow();
  return { poses, focus: { x: f.x, y: f.y }, done: true };
}
