import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

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
