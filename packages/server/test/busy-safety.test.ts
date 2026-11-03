import { describe, expect, it } from "vitest";
import type { StuckPlayer } from "../src/scripts";
import { flatWorld } from "./harness";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 021 US3/US4: a player in a cutscene shows as busy and is out of reach; the others play on.

const scene = scriptFile(100, ["L1:", ["ApplyMovement", { arg0: 255, movement: { movement: "M1" } }], ["End"]], { M1: [{ action: "FaceNorth", count: 1 }] });
const data = () => scriptData([scene], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) });

describe("busy during a cutscene", () => {
  it("marks the player busy and sheltered for the others, until the answer", () => {
    const t = story(data());
    const a = t.connect();
    t.connect();
    t.step();
    t.press(a);
    const me = () => t.entity(a.welcome!.entityId)!.data;
    expect([me()["busy"], me()["cutscene"]]).toEqual([true, true]);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect([me()["busy"], me()["cutscene"]]).toEqual([undefined, undefined]);
  });

  it("the open menu shows busy but does not shelter", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    a.conn.send({ type: "menu", open: true });
    t.step();
    expect(t.entity(a.welcome!.entityId)!.data["cutscene"]).toBeUndefined();
  });

  it("a player who leaves mid-cutscene comes back free", () => {
    const t = story(data());
    t.connect("Host");
    const a = t.connect("Guest");
    t.step();
    t.press(a);
    a.conn.close();
    t.step();
    const back = t.connect("Guest", undefined, { resumeToken: a.welcome!.resumeToken });
    t.step(2);
    const me = t.entity(back.welcome!.entityId)!.data;
    expect([me["busy"], me["cutscene"]]).toEqual([undefined, undefined]);
  });

  it("the cutscene turns the player as staged", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(t.entity(a.welcome!.entityId)!.facing).toBe("north");
  });

  it("a script starts with the player on the center of their tile, as the original's grid", () => {
    const t = story(data(), { spawn: () => ({ area: "60", x: at(1) + 5, y: at(1) - 3 }) });
    const a = t.connect();
    t.step();
    t.press(a);
    expect(t.entity(a.welcome!.entityId)).toMatchObject({ x: at(1), y: at(1) });
  });

  it("a walk from off the center ends on the tile it reaches, as the client draws it", () => {
    const walk = scriptFile(100, ["L1:", ["ApplyMovement", { arg0: 255, movement: { movement: "M1" } }], ["End"]], { M1: [{ action: "WalkNormalNorth", count: 1 }] });
    const t = story(scriptData([walk], { 60: mapEvents({ npcs: [npc(0, 1, 4, 0)] }) }), { spawn: () => ({ area: "60", x: at(1) + 3, y: at(3) }) });
    const a = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(t.entity(a.welcome!.entityId)).toMatchObject({ x: at(1), y: at(2) });
  });

  it("a script the player can walk away from reports nothing", () => {
    const stuck: unknown[] = [];
    const t = story(data(), { onStuck: (s) => stuck.push(s) });
    const a = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(stuck).toEqual([]);
  });

  it("a cutscene that ends in a wall is reported and the player freed", () => {
    const walk = scriptFile(100, ["L1:", ["ApplyMovement", { arg0: 255, movement: { movement: "M1" } }], ["End"]], { M1: [{ action: "WalkNormalNorth", count: 1 }] });
    const tiles = Array.from({ length: 256 }, (_, i) => ({ category: i === 16 + 1 ? ("blocked" as const) : ("free" as const), raw: 0 }));
    const stuck: StuckPlayer[] = [];
    const t = story(scriptData([walk], { 60: mapEvents({ npcs: [npc(0, 1, 3, 0)] }) }), { world: flatWorld({ width: 16, height: 16, tiles }), spawn: () => ({ area: "60", x: at(1), y: at(2) }), onStuck: (s) => stuck.push(s) });
    const a = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(stuck).toEqual([expect.objectContaining({ file: 100, entry: 0, area: "60", x: 1, z: 1, freed: true })]);
    expect(t.entity(a.welcome!.entityId)).not.toMatchObject({ x: at(1), y: at(1) });
  });

  it("a cutscene that leaves a person on the player's tile is reported with who", () => {
    const walk = scriptFile(100, ["L1:", ["ApplyMovement", { arg0: 0, movement: { movement: "M1" } }], ["End"]], { M1: [{ action: "WalkNormalNorth", count: 1 }] });
    const stuck: StuckPlayer[] = [];
    const t = story(scriptData([walk], { 60: mapEvents({ npcs: [npc(0, 1, 3, 0)] }) }), { spawn: () => ({ area: "60", x: at(1), y: at(2) }), onStuck: (s) => stuck.push(s) });
    const a = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(stuck).toEqual([expect.objectContaining({ x: 1, z: 2, people: [0] })]);
  });

  it("Estou preso cuts a running cutscene short and leaves the player at the last Center, free to walk", () => {
    const t = story(data());
    const a = t.connect("Gold", undefined, { save: { respawn: { area: "60", x: at(5), y: at(5) } } });
    t.step();
    t.press(a);
    expect(t.of(a, "script")).toHaveLength(1);
    a.conn.send({ type: "rescue" });
    t.step();
    expect(t.of(a, "rescued")).toHaveLength(1);
    expect(t.of(a, "script-lock").at(-1)).toMatchObject({ locked: false });
    expect(t.entity(a.welcome!.entityId)).toMatchObject({ area: "60", x: at(5), y: at(5), facing: "south" });
    t.walk(a, { x: 1, y: 0 }, 4);
    expect(t.entity(a.welcome!.entityId)!.x).toBeGreaterThan(at(5));
  });

  it("a busy player starts nothing else: interact is the cutscene's", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    t.press(a);
    t.press(a);
    t.press(a);
    expect(t.of(a, "script")).toHaveLength(1);
  });
});
