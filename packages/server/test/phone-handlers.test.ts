import type { PhoneBook } from "@soulsilver/shared/phone";
import { describe, expect, it } from "vitest";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 026, T036: the phone's script commands in a session. RegisterGearNumber keeps the number in the
// player's save; a script's call (std 3:39: SetPhoneCall, RunPhoneCall) rings on the Pokégear with the
// extracted text and the scene goes on only once the player hangs up (research R7.2).

const BOOK: PhoneBook = {
  contacts: [{ id: 1, type: 2, trainerClass: 201, trainer: 0, map: 61, gift: 0, localScript: 1, rematchWeekday: 7, rematchTime: 3, tier: 0, greeting: 255, bank: 716, outgoing: [], incoming: [] }],
  scripts: [{ id: 2, lines: [33, 34], type: 0, param0: 0, param1: 0 }],
  greetings: [], rematchSets: [],
};
const scene = scriptFile(100, [
  "L1:",
  ["RegisterGearNumber", { arg0: 1 }],
  ["CheckRegisteredPhoneNumber", { arg0: 1, arg1: 0x4001 }],
  ["SetPhoneCall", { arg0: 1, arg1: 2, arg2: 0 }],
  ["RunPhoneCall"],
  ["SetFlag", { flag: { flag: 500 } }],
  ["End"],
]);
const data = () => ({ ...scriptData([scene], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), phone: BOOK });

describe("phone commands in a session (spec 026)", () => {
  it("registers the number for this player, rings Elm's call on the phone, then goes on", () => {
    const t = story(data());
    const a = t.connect("A");
    const b = t.connect("B");
    t.step();
    t.press(a);
    const call = t.of(a, "phone-call").at(-1)!;
    expect(call).toMatchObject({ contact: 1, direction: "in", lines: ["0716:33"], buffers: { 0: { kind: "player" } } });
    expect(t.of(a, "script").map((m) => m.request.kind)).not.toContain("say");
    expect(t.of(b, "phone-call")).toHaveLength(0);
    // The scene waits for the call.
    t.step(5);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).not.toContain(500);
  });

  it("the scene goes on once the call is answered, and the number stays in the save", () => {
    const t = story(data());
    const a = t.connect("A");
    t.step();
    t.press(a);
    a.conn.send({ type: "phoneAnswer", callId: t.of(a, "phone-call").at(-1)!.callId });
    t.step(2);
    expect(t.of(a, "phone-state").at(-1)?.contacts).toEqual([{ id: 1, name: "0716:0", seeking: false }]);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.flags).toContain(500);
    // CheckRegisteredPhoneNumber saw the number just registered.
    expect(save.vars[String(0x4001)]).toBe(1);
    expect(save.phone.contacts).toEqual([1]);
    expect(save.phone.log).toEqual([{ contact: 1, direction: "in", at: "2026-10-24T12:00:00.000Z" }]);
  });

  it("refuses an answer to a call that does not ring", () => {
    const t = story(data());
    const a = t.connect("A");
    t.step();
    a.conn.send({ type: "phoneAnswer", callId: 7 });
    t.step();
    expect(t.of(a, "notice").at(-1)).toEqual({ type: "notice", code: "action-refused" });
  });
});

// Route 30's 227:4: Mom's scripted call asks about saving money; the scene goes on once she answered the choice.
describe("Mom's call from a script (spec 026)", () => {
  const MOM: PhoneBook = {
    contacts: [{ id: 0, type: 1, trainerClass: 200, trainer: 0, map: 63, gift: 0, localScript: 23, rematchWeekday: 7, rematchTime: 3, tier: 0, greeting: 255, bank: 664, outgoing: [], incoming: [] }],
    scripts: [],
    greetings: [],
    rematchSets: [],
  };
  const scene = scriptFile(100, ["L1:", ["SetPhoneCall", { arg0: 0, arg1: 2, arg2: 0 }], ["RunPhoneCall"], ["SetFlag", { flag: { flag: 0xa7 } }], ["End"]]);
  const data = () => ({ ...scriptData([scene], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }), phone: MOM });

  it("asks, takes the choice, says her reply, then the scene sets its flag", () => {
    const t = story(data());
    const a = t.connect("A");
    t.step();
    t.press(a);
    const ask = t.of(a, "phone-call").at(-1)!;
    expect(ask).toMatchObject({ contact: 0, lines: ["0664:22"], choices: ["0271:8", "0271:9"] });
    a.conn.send({ type: "phoneAnswer", callId: ask.callId });
    t.step();
    expect(t.of(a, "notice").at(-1)).toEqual({ type: "notice", code: "action-refused" });
    a.conn.send({ type: "phoneAnswer", callId: ask.callId, choice: 0 });
    t.step();
    const reply = t.of(a, "phone-call").at(-1)!;
    expect(reply.lines).toEqual(["0664:25"]);
    a.conn.send({ type: "phoneAnswer", callId: reply.callId });
    t.step(2);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toEqual(expect.arrayContaining([0xa7, 0x986]));
  });
});
