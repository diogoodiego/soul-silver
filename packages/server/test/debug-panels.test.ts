import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 024 US5 (FR-010, research R6): the debugger's objects and conditions, from the same checks the game makes.

const file = scriptFile(100, ["L1:", ["End"], "L2:", ["End"]]);
const ref = (entry: number) => ({ id: entry + 1, file: 100, entry });
const events = mapEvents({
  npcs: [npc(0, 1, 2, null), npc(1, 3, 2, null, 418)],
  levelScripts: { onTransition: null, onResume: null, onLoad: null, frames: [{ variable: 0x4106, value: 2, script: ref(0) }] },
  triggers: [{ script: ref(1), x: 10, z: 10, w: 2, h: 1, y: 0, variable: 0x4072, value: 0 }],
});
const data = () => scriptData([file], { 60: events });

describe("debugger panels", () => {
  it("lists the map's objects with their hide flag and whether this player sees them", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: { flags: [418], vars: { [String(0x4106)]: 1 } } });
    a.conn.send({ type: "debugScript", on: true });
    t.step(2);
    expect(t.of(a, "script-debug").at(-1)?.objects).toEqual([
      { id: 0, sprite: 3, hideFlag: null, visible: true },
      { id: 1, sprite: 3, hideFlag: 418, visible: false },
    ]);
  });

  it("lists the map scripts and triggers with their condition and whether it holds now", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: { vars: { [String(0x4106)]: 1 } } });
    a.conn.send({ type: "debugScript", on: true });
    t.step(2);
    expect(t.of(a, "script-debug").at(-1)?.triggers).toEqual([
      { kind: "mapScript", script: "0100:0", condition: "var 0x4106 = 2", met: false },
      { kind: "trigger", script: "0100:1", condition: "var 0x4072 = 0 @ (10, 10) 2×1", met: true },
    ]);
  });

  it("each player sees their own panels", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: { flags: [418] } });
    const b = t.connect("B");
    a.conn.send({ type: "debugScript", on: true });
    b.conn.send({ type: "debugScript", on: true });
    t.step(2);
    expect(t.of(a, "script-debug").at(-1)?.objects[1]?.visible).toBe(false);
    expect(t.of(b, "script-debug").at(-1)?.objects[1]?.visible).toBe(true);
  });

  it("sends nothing with the debugger off", () => {
    const t = story(data());
    const a = t.connect();
    t.step(2);
    expect(t.of(a, "script-debug")).toEqual([]);
  });
});
