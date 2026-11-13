import { describe, expect, it } from "vitest";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 021 US2/US3: cutscenes go to the player who triggered them; where they leave people is that player's alone.

const walkAway = scriptFile(100, ["L1:", ["ApplyMovement", { arg0: 0, movement: { movement: "M1" } }], ["WaitMovement"], ["End"]], { M1: [{ action: "WalkNormalEast", count: 3 }] });
const data = (file = walkAway) => scriptData([file], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) });
type Story = ReturnType<typeof story>;
/** Where this client last saw person 0, from spawns and deltas. */
function seen(c: ReturnType<Story["connect"]>) {
  let id: number | undefined;
  let pos: { x: number; y: number } | undefined;
  for (const s of c.states()) {
    for (const e of s.spawned) if (e.kind === "npc" && e.data["person"] === 0) [id, pos] = [e.id, { x: e.x, y: e.y }];
    for (const d of s.changed) if (d.id === id) pos = { x: (d as { x?: number }).x ?? pos!.x, y: (d as { y?: number }).y ?? pos!.y };
  }
  return pos;
}

describe("cutscenes", () => {
  it("the request goes only to the player who triggered it", () => {
    const t = story(data());
    const a = t.connect();
    const b = t.connect();
    t.step();
    t.press(a);
    expect(t.of(a, "script").map((m) => m.request.kind)).toEqual(["cutscene"]);
    expect(t.of(b, "script")).toEqual([]);
  });

  it("after the answer, the person stands where the steps left it for that player only", () => {
    const t = story(data());
    const a = t.connect();
    const b = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step(2);
    expect(seen(a)).toEqual({ x: at(4), y: at(2) });
    expect(seen(b)).toEqual({ x: at(1), y: at(2) });
  });

  it("without an answer the script times out and lets the player go", () => {
    const t = story(data(), { scriptTimeoutTicks: 5 });
    const a = t.connect();
    t.step();
    t.press(a);
    t.step(1300);
    expect(t.entity(a.welcome!.entityId)!.data["busy"]).toBeUndefined();
  });

  it("MovePersonFacing keeps the person's new place in that player's save", () => {
    const move = scriptFile(100, ["L1:", ["MovePersonFacing", { person: 0, x: 5, y: 6, z: 0, facing: 3 }], ["End"]]);
    const t = story(data(move));
    t.connect("Host");
    const a = t.connect();
    t.step();
    t.press(a);
    t.step();
    expect(seen(a)).toEqual({ x: at(5), y: at(6) });
    a.conn.send({ type: "leave" });
    const placement = a.saves().at(-1)!.save.npcPlacement;
    expect(placement).toEqual({ "60": { "0": { x: 5, z: 6, facing: "east" } } });
    const back = t.connect("Again", undefined, { save: { npcPlacement: placement } });
    t.step(3);
    expect(seen(back)).toEqual({ x: at(5), y: at(6) });
  });
});

describe("collision follows each player's view (spec 021)", () => {
  it("a person moved for A blocks A at its new tile and B at the old one", () => {
    const t = story(data());
    const a = t.connect();
    const b = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step(2);
    // The person left (1,2) for A only: B still bumps into it there, A walks through.
    t.walk(b, { x: 0, y: 1 }, 20);
    expect(Math.floor(t.entity(b.welcome!.entityId)!.y / 16)).toBe(1);
    t.walk(a, { x: 0, y: 1 }, 20);
    expect(Math.floor(t.entity(a.welcome!.entityId)!.y / 16)).toBeGreaterThan(1);
  });
});
