import { describe, expect, it } from "vitest";
import { initAzaleaGym, RIDE_PX_PER_TICK, rideAt, rideSpinarak, rideTicks, SPIDER_MODEL, gymProps, toggleSwitch, type AzaleaGym } from "../../src/field/azalea-gym.ts";

// Spec 030.5: the Azalea Gym's Spinarak threads on a synthetic layout (principle II). Three stops; the
// thread from 0 forks on lever 0: to 1 with it off, to 2 with it on. Stop 2 leads back to 0 only with
// both levers on. The ROM keeps one path per thread, listed from either end.

const thread01 = [{ x: 1, z: 9 }, { x: 1, z: 6 }, { x: 4, z: 6 }, { x: 4, z: 3 }];
const thread02 = [{ x: 7, z: 2 }, { x: 7, z: 6 }, { x: 1, z: 6 }, { x: 1, z: 9 }];
const gym: AzaleaGym = {
  stations: [{ x: 1, z: 9 }, { x: 4, z: 3 }, { x: 7, z: 2 }],
  routes: [
    [{ to: 1, path: thread01 }, { to: 2, path: thread02 }, { to: 1, path: thread01 }, { to: 2, path: thread02 }],
    [{ to: 0, path: thread01 }, null, null, null],
    [null, null, null, { to: 0, path: thread02 }],
  ],
  spiders: [0],
};

describe("the Azalea Gym's Spinarak (spec 030.5)", () => {
  it("starts with the spiders where the ROM puts them and every lever off", () => {
    expect(initAzaleaGym(gym)).toEqual({ spiders: [0], switches: 0 });
  });

  it("rides the spider to the end of its thread, which the lever state picks", () => {
    const off = rideSpinarak(gym, initAzaleaGym(gym), 0)!;
    expect(off).toMatchObject({ to: 1, state: { spiders: [1], switches: 0 } });
    const on = rideSpinarak(gym, toggleSwitch(initAzaleaGym(gym), 0), 0)!;
    expect(on).toMatchObject({ to: 2, state: { spiders: [2], switches: 1 } });
  });

  // The cart (gym02lift) hangs a tile south of where it holds the thread; the rider stands on it and steps off forward.
  it("steps the player off the cart, a tile south of the thread's end, forward and facing the way it went", () => {
    expect(rideSpinarak(gym, initAzaleaGym(gym), 0)).toMatchObject({ land: { x: 4, z: 3 }, facing: "north", spider: 0, path: thread01 });
  });

  it("walks a thread the ROM lists from the other end backwards", () => {
    const there = rideSpinarak(gym, toggleSwitch(initAzaleaGym(gym), 0), 0)!;
    expect(there).toMatchObject({ land: { x: 7, z: 2 }, facing: "north" });
    const back = rideSpinarak(gym, toggleSwitch(there.state, 1), 2)!;
    expect(back).toMatchObject({ to: 0, land: { x: 1, z: 11 }, facing: "south", state: { spiders: [0] } });
  });

  it("does nothing without a spider at the stop or a thread for the lever state", () => {
    const state = initAzaleaGym(gym);
    expect(rideSpinarak(gym, state, 1)).toBeUndefined();
    const atTwo = rideSpinarak(gym, toggleSwitch(state, 0), 0)!.state;
    expect(rideSpinarak(gym, atTwo, 2)).toBeUndefined();
  });

  it("glides along the thread at a steady pace, facing each stretch, and stops at its end", () => {
    const { path } = rideSpinarak(gym, initAzaleaGym(gym), 0)!;
    // 3 + 3 + 3 tiles of thread, 48 px each.
    expect(rideTicks(path)).toBe(Math.ceil(144 / RIDE_PX_PER_TICK));
    expect(rideAt(path, 0)).toEqual({ x: 24, z: 152, facing: "north" });
    expect(rideAt(path, Math.round(72 / RIDE_PX_PER_TICK))).toEqual({ x: 48, z: 104, facing: "east" });
    expect(rideAt(path, 999)).toEqual({ x: 72, z: 56, facing: "north" });
  });

  it("draws each spider at its stop, the one ridden under the rider", () => {
    const state = { spiders: [0, 2], switches: 0 };
    expect(gymProps(gym, state)).toEqual([
      { model: SPIDER_MODEL, x: 24, y: 0, z: 152 },
      { model: SPIDER_MODEL, x: 120, y: 0, z: 40 },
    ]);
    expect(gymProps(gym, state, { spider: 1, x: 50, z: 60 })[1]).toEqual({ model: SPIDER_MODEL, x: 50, y: 0, z: 60 });
  });

  it("shows each rope and lever in the pose of its lever's bit, after the spiders", () => {
    const levers = [
      { model: 116, lever: 0, x: 200, y: -1, z: 200 },
      { model: 122, lever: 1, x: 40, y: 0, z: 296 },
    ];
    const withLevers = { ...gym, levers };
    expect(gymProps(withLevers, { spiders: [0], switches: 2 }).slice(1)).toEqual([
      { model: 116, x: 200, y: -1, z: 200, pose: 0 },
      { model: 122, x: 40, y: 0, z: 296, pose: 1 },
    ]);
  });

  it("each lever flips its own bit", () => {
    const s = toggleSwitch(toggleSwitch(initAzaleaGym(gym), 1), 0);
    expect(s.switches).toBe(3);
    expect(toggleSwitch(s, 1).switches).toBe(1);
  });
});
