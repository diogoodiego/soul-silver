// The Azalea Gym's Spinarak (spec 030.5): spiders wait at stops; stepping on a stop with a spider rides
// it along the thread the lever state picks, to the stop at its other end. The threads are the ROM's
// (azalea-gym.json); the state is the original's Gymmick block (spiders[4], switches), kept per visit.

export interface GymTile {
  x: number;
  z: number;
}

export interface AzaleaGym {
  stations: GymTile[];
  /** By stop, then by lever state (the switches bits): the thread from that stop, or null for none. */
  routes: ({ to: number; path: GymTile[] } | null)[][];
  /** The stop of each spider when the map is entered (InitAzaleaGym). */
  spiders: number[];
  /** The ropes and levers each lever moves, where the map places them (map pixels); absent in older extractions. */
  levers?: { model: number; lever: number; x: number; y: number; z: number }[];
}

export interface AzaleaGymState {
  spiders: number[];
  switches: number;
}

type Facing = "north" | "south" | "west" | "east";

/** gym02lift in the room building archive (a/1/4/8): the Spinarak cart the gym places at each stop. */
export const SPIDER_MODEL = 118;
/** gym02lift hangs from its origin, where it holds the thread: its body, where the rider stands, is a tile south (mesh z −2 to 34 px). */
export const RIDER_OFFSET_PX = 16;
/** shortcut: 4 px a tick (walking is 3); the original's ride speed is not read, read it from overlay 4 if it shows. */
export const RIDE_PX_PER_TICK = 4;

const TILE_PX = 16;
/** A tile's center in map pixels, where indoor props and feet stand. */
const px = (tile: number) => tile * TILE_PX + TILE_PX / 2;

export const initAzaleaGym = (gym: AzaleaGym): AzaleaGymState => ({ spiders: [...gym.spiders], switches: 0 });

/** AzaleaGymSwitch (overlay 4, 0x02254404): lever 0 flips bit 0 of switches, lever 1 bit 1. */
export const toggleSwitch = (state: AzaleaGymState, lever: number): AzaleaGymState => ({ ...state, switches: state.switches ^ (1 << lever) });

function facingOf(dx: number, dz: number): Facing {
  if (Math.abs(dz) >= Math.abs(dx)) return dz < 0 ? "north" : "south";
  return dx < 0 ? "west" : "east";
}

export function rideSpinarak(gym: AzaleaGym, state: AzaleaGymState, stop: number) {
  const spider = state.spiders.indexOf(stop);
  const route = gym.routes[stop]?.[state.switches];
  if (spider === -1 || !route) return undefined;
  const from = gym.stations[stop]!;
  const path = route.path[0]!.x === from.x && route.path[0]!.z === from.z ? route.path : [...route.path].reverse();
  const end = path.at(-1)!;
  const before = path.at(-2)!;
  const dx = Math.sign(end.x - before.x);
  const dz = Math.sign(end.z - before.z);
  const spiders = [...state.spiders];
  spiders[spider] = route.to;
  // The player steps off the cart's body (a tile south of the thread's end) forward.
  const land = { x: end.x + dx, z: end.z + RIDER_OFFSET_PX / TILE_PX + dz };
  return { to: route.to, spider, path, state: { ...state, spiders }, land, facing: facingOf(dx, dz) } as const;
}

const length = (a: GymTile, b: GymTile) => Math.hypot(b.x - a.x, b.z - a.z) * TILE_PX;

export const rideTicks = (path: GymTile[]) => Math.ceil(path.slice(1).reduce((sum, p, i) => sum + length(path[i]!, p), 0) / RIDE_PX_PER_TICK);

/** Where the rider is `tick` ticks into the ride, in map pixels, facing the stretch they are on; the end once it is over. */
export function rideAt(path: GymTile[], tick: number): { x: number; z: number; facing: Facing } {
  let left = tick * RIDE_PX_PER_TICK;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const d = length(a, b);
    const facing = facingOf(b.x - a.x, b.z - a.z);
    if (left < d || i === path.length - 1) {
      const t = Math.min(1, left / d);
      return { x: Math.round(px(a.x) + (px(b.x) - px(a.x)) * t), z: Math.round(px(a.z) + (px(b.z) - px(a.z)) * t), facing };
    }
    left -= d;
  }
  return { x: px(path[0]!.x), z: px(path[0]!.z), facing: "south" };
}

/**
 * The gym as script props (map pixels): the spider carts, `moving` putting one under the rider, then each rope and
 * lever in the pose of its lever's bit (AzaleaGymSwitch plays animation 0 for a clear bit, 1 for a set one).
 */
export function gymProps(gym: AzaleaGym, state: AzaleaGymState, moving?: { spider: number; x: number; z: number }) {
  const spiders = state.spiders.map((stop, i) =>
    moving?.spider === i ? { model: SPIDER_MODEL, x: moving.x, y: 0, z: moving.z } : { model: SPIDER_MODEL, x: px(gym.stations[stop]!.x), y: 0, z: px(gym.stations[stop]!.z) },
  );
  const levers = (gym.levers ?? []).map(({ lever, ...at }) => ({ ...at, pose: (state.switches >> lever) & 1 }));
  return [...spiders, ...levers];
}
