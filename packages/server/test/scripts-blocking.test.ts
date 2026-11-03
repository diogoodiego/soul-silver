import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 020 FR-004 and edge cases: blocking commands wait for this client only, never for the tick.

const ask = scriptFile(100, [
  "L1:",
  ["NPCMsg", { msg_id: { text: "0007:1" } }],
  ["YesNo", { arg0: 0x800c }],
  ["CompareVarToValue", { var: { variable: 0x800c }, val: 0 }],
  ["GoToIf", { condition: 1, dest: { label: "Y" } }],
  ["End"],
  "Y:",
  ["SetFlag", { flag: { flag: 310 } }],
  ["Wait", { frames: 30, var: { variable: 0x800c } }],
  ["SetFlag", { flag: { flag: 311 } }],
  ["End"],
]);
const data = () => scriptData([ask], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) });

describe("blocking commands", () => {
  it("a yes answer takes the yes branch; the server counts the wait itself", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    expect(t.of(a, "script").at(-1)).toEqual({ type: "script", id: 2, request: { kind: "yes-no" } });
    a.conn.send({ type: "script-answer", id: 2, answer: 0 });
    // The wait still holds the player; a save then keeps the state from before the script (spec 024).
    t.step(19);
    expect(t.of(a, "script-lock").at(-1)?.locked).toBe(true);
    t.step(3);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toEqual([310, 311]);
  });

  it("the wait ends after 30 frames' worth of ticks", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    a.conn.send({ type: "script-answer", id: 2, answer: 0 });
    t.step(22);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toEqual([310, 311]);
  });

  it("ignores an answer with an old id, or when nothing waits", () => {
    const t = story(data());
    const a = t.connect();
    t.step();
    a.conn.send({ type: "script-answer", id: 1 });
    t.step();
    t.press(a);
    a.conn.send({ type: "script-answer", id: 7 });
    t.step();
    expect(t.of(a, "script")).toHaveLength(1);
    expect(t.logs.some((l) => l.includes("script-answer"))).toBe(true);
  });

  it("a client that never answers is let go after the timeout", () => {
    const t = story(data(), { scriptTimeoutTicks: 50 });
    const a = t.connect();
    t.step();
    t.press(a);
    // The press already took one tick past the request.
    for (let i = 0; i < 48; i++) {
      a.conn.send({ type: "save-ack", rev: 0 });
      t.step();
    }
    expect(t.of(a, "script-lock").at(-1)?.locked).toBe(true);
    a.conn.send({ type: "save-ack", rev: 0 });
    t.step(2);
    expect(t.of(a, "script-lock").at(-1)?.locked).toBe(false);
    expect(t.logs.some((l) => l.includes("timed out"))).toBe(true);
  });

  it("a waiting player does not hold up the others", () => {
    const t = story(data());
    const a = t.connect();
    const b = t.connect();
    t.step();
    t.press(a);
    const before = t.entity(b.welcome!.entityId)!.x;
    t.walk(b, { x: 1, y: 0 }, 10);
    expect(t.entity(b.welcome!.entityId)!.x).toBeGreaterThan(before);
  });
});
