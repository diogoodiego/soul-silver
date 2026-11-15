import { describe, expect, it } from "vitest";
import type { AzaleaGymFile } from "@soulsilver/shared/events";
import { SPIDER_MODEL } from "@soulsilver/shared/field";
import { at, mapEvents, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 030.5: the Azalea Gym's Spinarak in the headless server, on a synthetic gym (principle II). Stop 0
// at (1, 3) with its trigger below it at (1, 4); with every lever off its thread leads to stop 1 at
// (6, 6); the cart hangs a tile south of the thread, so the rider ends on its body at (6, 7), the stop's trigger,
// and steps off to (6, 8). Lever 0 (a trigger on the way) cuts the thread.

const path = [{ x: 1, z: 3 }, { x: 1, z: 5 }, { x: 6, z: 5 }, { x: 6, z: 6 }];
const gym: Omit<AzaleaGymFile, "kind" | "formatVersion"> = {
  stations: [{ x: 1, z: 3 }, { x: 6, z: 6 }],
  routes: [
    [{ to: 1, path }, null, null, null],
    [{ to: 0, path }, null, null, null],
  ],
  spiders: [0],
  levers: [],
};
const code = scriptFile(100, [
  "L1:", ["AzaleaGymInit"], ["End"],
  "L2:", ["AzaleaGymSpinarak", { arg0: 0 }], ["End"],
  "L3:", ["AzaleaGymSpinarak", { arg0: 1 }], ["End"],
  "L4:", ["AzaleaGymSwitch", { arg0: 0 }], ["End"],
]);
const trigger = (entry: number, x: number, z: number) => ({ script: { id: entry + 1, file: 100, entry }, x, z, w: 1, h: 1, y: 0, variable: 0x4000, value: 0 });

/** Spawns at (1, 7) and walks north (over the lever at (1, 6), when there is one) onto stop 0's trigger. */
function gymTest(lever: boolean) {
  const events = mapEvents({
    triggers: [trigger(1, 1, 4), trigger(2, 6, 7), ...(lever ? [trigger(3, 1, 6)] : [])],
    levelScripts: { onTransition: { id: 1, file: 100, entry: 0 }, onResume: null, onLoad: null, frames: [] },
  });
  const t = story({ ...scriptData([code], { 60: events }), azaleaGym: gym }, { spawn: () => ({ area: "60", x: at(1), y: at(7) }) });
  const a = t.connect();
  const player = () => t.session.world.all().find((e) => e.kind === "player")!;
  const tile = () => ({ x: Math.floor(player().x / 16), z: Math.floor(player().y / 16) });
  t.step(3);
  for (let i = 0; i < 60 && tile().x === 1 && tile().z > 4; i++) t.walk(a, { x: 0, y: -1 }, 1);
  const props = () => t.of(a, "script-event").flatMap((m) => (m.event.kind === "props" ? [m.event.props] : []));
  return { ...t, tile, player, props };
}

describe("the Azalea Gym's Spinarak (spec 030.5)", () => {
  it("the spiders show at their stops on entering the gym", () => {
    expect(gymTest(false).props()[0]).toEqual([{ model: SPIDER_MODEL, x: at(1), y: 0, z: at(3) }]);
  });

  it("the ride glides the player along the thread on the spider's body, a tile south of where it holds the thread", () => {
    const t = gymTest(false);
    t.step(12);
    // 12 ticks in: past the 2 tiles south, on the 5 tiles east.
    expect(t.player().y).toBe(at(6));
    expect(t.player().x).toBeGreaterThan(at(1));
    expect(t.player().x).toBeLessThan(at(6));
    expect(t.player().facing).toBe("east");
    expect(t.props().at(-1)).toEqual([{ model: SPIDER_MODEL, x: t.player().x, y: 0, z: t.player().y - 16 }]);
  });

  it("at the thread's end the player steps off the cart, without riding back, and the spider stays at the far stop", () => {
    const t = gymTest(false);
    t.step(60);
    expect(t.tile()).toEqual({ x: 6, z: 8 });
    expect(t.player().facing).toBe("south");
    expect(t.props().at(-1)).toEqual([{ model: SPIDER_MODEL, x: at(6), y: 0, z: at(6) }]);
  });

  it("a lever that cuts the thread leaves the player on the stop", () => {
    const t = gymTest(true);
    t.step(60);
    expect(t.tile()).toEqual({ x: 1, z: 4 });
  });

  it("a lever shows its rope in the other pose at once", () => {
    const rope = { model: 116, lever: 0, x: at(3), y: -1, z: at(5) };
    const events = mapEvents({ triggers: [trigger(3, 1, 6)], levelScripts: { onTransition: { id: 1, file: 100, entry: 0 }, onResume: null, onLoad: null, frames: [] } });
    const t = story({ ...scriptData([code], { 60: events }), azaleaGym: { ...gym, levers: [rope] } }, { spawn: () => ({ area: "60", x: at(1), y: at(7) }) });
    const a = t.connect();
    t.step(3);
    t.walk(a, { x: 0, y: -1 }, 8);
    const props = t.of(a, "script-event").flatMap((m) => (m.event.kind === "props" ? [m.event.props] : []));
    expect(props.map((list) => list.at(-1))).toEqual([
      { model: 116, x: at(3), y: -1, z: at(5), pose: 0 },
      { model: 116, x: at(3), y: -1, z: at(5), pose: 1 },
    ]);
  });
});
