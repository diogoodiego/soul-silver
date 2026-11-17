import { describe, expect, it } from "vitest";
import type { CollisionMap } from "@soulsilver/shared/game";
import { flatWorld } from "./harness";
import { at, mapEvents, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 033.3: the Blackthorn Gym's platforms on the server, per player. Synthetic: a map of lava (behavior 0x2C) where
// BlackthornGymInit puts platform 0 at (13, 75), its floor x 12–14, z 74–79.

const MAGMA = { category: "special" as const, raw: 0x062c };
const grid: CollisionMap = { width: 32, height: 96, tiles: Array.from({ length: 32 * 96 }, () => MAGMA) };

function gym() {
  const init = scriptFile(100, ["L1:", ["BlackthornGymInit"], ["End"]]);
  const events = mapEvents({ levelScripts: { onTransition: { id: 1, file: 100, entry: 0 }, onResume: null, onLoad: null, frames: [] } });
  const t = story(scriptData([init], { 60: events }), { world: flatWorld(grid), spawn: () => ({ area: "60", x: at(14), y: at(77) }) });
  const a = t.connect("A");
  t.step(3);
  const tile = () => {
    const e = t.session.world.get(a.welcome!.entityId)!;
    return { x: Math.floor(e.x / 16), z: Math.floor(e.y / 16) };
  };
  return { t, a, tile };
}

describe("Blackthorn Gym (item 033.3)", () => {
  it("the lava off the platforms stops the player", () => {
    const { t, a, tile } = gym();
    t.walk(a, { x: 0, y: 1 }, 40);
    expect(tile()).toEqual({ x: 14, z: 79 });
  });

  it("stepping onto the button beside its center moves the platform its width, with the player on it", () => {
    const { t, a, tile } = gym();
    // North until the button is stepped on.
    for (let i = 0; i < 40 && tile().z > 75; i++) t.walk(a, { x: 0, y: -1 }, 1);
    t.step(5);
    expect(tile()).toEqual({ x: 19, z: 75 });
    // The platform is under the player where it went: its floor ends a row up, then lava.
    t.walk(a, { x: 0, y: -1 }, 40);
    expect(tile()).toEqual({ x: 19, z: 74 });
  });
});
