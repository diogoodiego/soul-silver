import { describe, expect, it } from "vitest";
import { BLACKTHORN_START, blackthornFloor, blackthornPlatform, blackthornPress } from "../../src/field/blackthorn-gym.ts";

// Item 033.3: the Blackthorn Gym's lava platforms, after pokeheartgold's src/field/gymmick/blackthorn.c. Synthetic lava.

const lava = () => false;

describe("Blackthorn Gym platforms (item 033.3)", () => {
  it("starts where InitBlackthornGym puts them", () => {
    expect(BLACKTHORN_START).toEqual([
      { x: 13, z: 75, rot: 0 },
      { x: 9, z: 58, rot: 1 },
      { x: 14, z: 32, rot: 0 },
    ]);
  });

  it("has its rotate button at its center, a move button on each side and a 3×6 floor", () => {
    const p = blackthornPlatform(0, { x: 13, z: 75, rot: 0 });
    expect(p.rotate).toEqual({ x: 13, z: 75 });
    expect(p.forward).toEqual({ x: 14, z: 75 });
    expect(p.back).toEqual({ x: 12, z: 75 });
    expect(p.floor).toHaveLength(18);
    expect(p.floor).toContainEqual({ x: 12, z: 74 });
    expect(p.floor).toContainEqual({ x: 14, z: 79 });
    // Turned once: (dx, dz) becomes (-dz, dx) around the center.
    const turned = blackthornPlatform(1, { x: 9, z: 58, rot: 1 });
    expect(turned.forward).toEqual({ x: 9, z: 59 });
    expect(turned.floor).toContainEqual({ x: 10, z: 57 });
    expect(turned.floor).toContainEqual({ x: 5, z: 59 });
  });

  it("is floor to walk on wherever a platform lies", () => {
    expect(blackthornFloor(BLACKTHORN_START, 13, 79)).toBe(true);
    expect(blackthornFloor(BLACKTHORN_START, 13, 80)).toBe(false);
  });

  it("the side button moves the platform its width over the lava, with the player on it", () => {
    expect(blackthornPress(BLACKTHORN_START, 14, 75, lava)).toEqual({ state: [{ x: 18, z: 75, rot: 0 }, BLACKTHORN_START[1], BLACKTHORN_START[2]], dx: 5, dz: 0 });
    expect(blackthornPress(BLACKTHORN_START, 12, 75, lava)?.state[0]).toEqual({ x: 8, z: 75, rot: 0 });
  });

  it("does not move at all when anything but lava lies on the way", () => {
    // The leading wall of platform 0 moving east starts 3 tiles right of its center; a wall 2 steps further stops it.
    const wall = (x: number, z: number) => x === 18 && z === 75;
    expect(blackthornPress(BLACKTHORN_START, 14, 75, wall)).toEqual({ state: BLACKTHORN_START, dx: 0, dz: 0 });
  });

  it("the center button turns the platform a quarter, unless something is in its way", () => {
    expect(blackthornPress(BLACKTHORN_START, 13, 75, lava)?.state[0]).toEqual({ x: 13, z: 75, rot: 1 });
    // A wall where its bottom side sweeps.
    const wall = (x: number, z: number) => x === 12 && z === 80;
    expect(blackthornPress(BLACKTHORN_START, 13, 75, wall)?.state[0]).toEqual({ x: 13, z: 75, rot: 0 });
  });

  it("anywhere else is no button", () => {
    expect(blackthornPress(BLACKTHORN_START, 13, 76, lava)).toBeUndefined();
  });
});
