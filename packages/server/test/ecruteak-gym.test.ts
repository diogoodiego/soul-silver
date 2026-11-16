import { describe, expect, it } from "vitest";
import { at, mapEvents, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 031.3: the Ecruteak Gym's invisible path in the headless server, on a synthetic layout (principle II). As in map 80,
// the void beside the path is walkable and covered by triggers (scr_seq 922:2): the player spins, vanishes and is warped back
// to the entrance. Here the path runs north along x = 1 from the entrance (1, 7) to (1, 2), with the void at x = 0 and x = 2.

const GUARD = 0x4109;
const code = scriptFile(
  100,
  [
    "L1:",
    ["EcruteakGymInit"],
    ["End"],
    "L2:",
    ["ScrCmd_609"],
    ["LockAll"],
    ["PlaySE", { arg0: 1585 }],
    ["ApplyMovement", { arg0: 255, movement: { movement: "M1" } }],
    ["WaitMovement"],
    ["FadeScreen", { arg0: 6, speed: 1, direction: 0, color: 0 }],
    ["WaitFade"],
    ["Warp", { arg0: 60, arg1: 0, arg2: 1, arg3: 7, arg4: 0 }],
    ["FadeScreen", { arg0: 6, speed: 1, direction: 1, color: 0 }],
    ["WaitFade"],
    ["ReleaseAll"],
    ["End"],
  ],
  { M1: [{ action: "FaceSouth", count: 2 }, { action: "FaceWest", count: 2 }, { action: "FaceNorth", count: 2 }, { action: "FaceEast", count: 1 }, { action: "SetInvisible", count: 0 }] },
);
const voids = [0, 2].map((x) => ({ script: { id: 2, file: 100, entry: 1 }, x, z: 2, w: 1, h: 5, y: 0, variable: GUARD, value: 0 }));

function gym() {
  const events = mapEvents({ triggers: voids, levelScripts: { onTransition: { id: 1, file: 100, entry: 0 }, onResume: null, onLoad: null, frames: [] } });
  const t = story(scriptData([code], { 60: events }), { spawn: () => ({ area: "60", x: at(1), y: at(7) }) });
  const a = t.connect();
  const player = () => t.session.world.all().find((e) => e.kind === "player")!;
  const tile = () => ({ x: Math.floor(player().x / 16), z: Math.floor(player().y / 16) });
  t.step(3);
  return { ...t, a, tile };
}

describe("the Ecruteak Gym's invisible path (item 031.3)", () => {
  it("the path itself holds the player", () => {
    const t = gym();
    for (let i = 0; i < 120 && t.tile().z > 2; i++) t.walk(t.a, { x: 0, y: -1 }, 1);
    t.step(30);
    expect(t.tile()).toEqual({ x: 1, z: 2 });
  });

  it("a step off it drops the player back at the entrance", () => {
    const t = gym();
    let answered = 0;
    for (let i = 0; i < 60 && t.tile().z > 4; i++) t.walk(t.a, { x: 0, y: -1 }, 1);
    expect(t.tile()).toEqual({ x: 1, z: 4 });
    for (let i = 0; i < 30 && t.tile().x === 1; i++) t.walk(t.a, { x: 1, y: 0 }, 1);
    // Each cutscene answered as the client does once it played it.
    for (let i = 0; i < 60; i++) {
      // An answer can run the script on to its next request at once.
      while (answered < t.of(t.a, "script").length) t.a.conn.send({ type: "script-answer", id: t.of(t.a, "script")[answered++]!.id });
      t.walk(t.a, { x: 0, y: 0 }, 1);
    }
    expect(t.tile()).toEqual({ x: 1, z: 7 });
    expect(t.of(t.a, "script").flatMap((m) => (m.request.kind === "cutscene" ? m.request.steps : [])).at(-1)).toEqual({ kind: "hide", actor: "player" });
    expect(t.logs).toEqual([]);
  });
});
