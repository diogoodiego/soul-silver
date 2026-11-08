import type { PhoneBook } from "@soulsilver/shared/phone";
import { REMATCH_GROUP_FLAG } from "@soulsilver/shared/phone";
import { describe, expect, it } from "vitest";
import { FLAG_RADIO_TOWER } from "../src/phone";
import { arenaSetup, FACING, FLAG_BASE, trainer, trainerNpc } from "./trainer-fixture";

// Spec 026, T038 (layer 2, research R7.4): Joey's rematch the original's way. His REMATCH call sets `seeking`
// for the player who answers; talking to him then fights the first unbeaten step of his row (scr_seq_0953.s,
// GetPhoneBookRematch) while its group is open; the win clears `seeking` (ScrCmd_462). Per player throughout.

const JOEY = 8;
const JOEY_2 = 279;
const JOEY_3 = 280;
const BOOK: PhoneBook = {
  contacts: [{ id: 10, type: 0, trainerClass: 2, trainer: JOEY, map: 34, gift: 0, localScript: 29, rematchWeekday: 1, rematchTime: 1, tier: 1, greeting: 255, bank: 675, outgoing: [], incoming: [{ type: 2, chance: 100, scriptType: 0, script: 33 }] }],
  scripts: [{ id: 33, lines: [10, 10], type: 3, param0: 1, param1: 0 }],
  greetings: [], rematchSets: [{ base: JOEY, sequence: [JOEY, JOEY_2, JOEY_3, 0, 0] }],
};
// Joey stands below the spawn, his sight 0: he only fights when talked to.
const game = () => arenaSetup({ trainers: [trainer(JOEY, ["sentret"]), trainer(JOEY_2, ["rattata", "rattata"]), trainer(JOEY_3, ["sentret", "rattata", "sentret"])], npcs: [trainerNpc(0, 1, 2, JOEY, FACING.north, 0)], phone: BOOK });
const beatJoey = [FLAG_BASE + JOEY, FLAG_RADIO_TOWER, REMATCH_GROUP_FLAG(2)];
type Game = ReturnType<typeof game>;
type Client = ReturnType<Game["join"]>;

/** Walks 12 tiles east and back, then faces Joey: enough steps for a waiting call to ring. */
function walkAndFace(t: Game, c: Client) {
  const go = (x: number, y: number) => {
    t.send(c, 0, { x, y });
    t.step();
  };
  for (const x of [1, -1]) for (let i = 0; i < 70; i++) go(x, 0);
  for (let i = 0; i < 3; i++) go(0, 1);
  t.idle(c, 2);
}
const talk = (t: Game, c: Client) => {
  t.press(c, t.BUTTON.interact);
  t.untilStart(c, 40);
};
const started = (t: Game, c: Client) => t.of(c, "trainerBattleStart").filter((m) => m.player === c.welcome!.playerId).map((m) => m.trainerId);
const seeking = (t: Game, c: Client) => t.of(c, "phone-state").at(-1)?.contacts.find((x) => x.id === 10)?.seeking;
function win(t: Game) {
  for (let i = 0; i < 6; i++) {
    t.knockOut();
    t.step(30);
  }
}

describe("Joey's rematch (spec 026, US4)", () => {
  it("the call answered by A sets seeking for A only, and A fights JOEY_2 while B fights nobody", () => {
    const t = game();
    const a = t.join("A", { flags: beatJoey, phone: { contacts: [10], seeking: [], called: [], pending: [{ caller: 10, call: 33 }], log: [] } });
    const b = t.join("B", { flags: beatJoey, phone: { contacts: [10], seeking: [], called: [], pending: [], log: [] } });
    walkAndFace(t, a);
    const call = t.of(a, "phone-call").at(-1)!;
    expect(call).toMatchObject({ contact: 10, lines: ["0675:10"] });
    a.conn.send({ type: "phoneAnswer", callId: call.callId });
    t.step();
    expect([seeking(t, a), seeking(t, b)]).toEqual([true, false]);

    talk(t, a);
    expect(started(t, a)).toEqual([JOEY_2]);
    walkAndFace(t, b);
    t.press(b, t.BUTTON.interact);
    t.step(5);
    expect(started(t, b)).toEqual([]);
    expect(t.of(b, "trainerSay")).toHaveLength(1);
  });

  it("winning clears seeking and marks JOEY_2; the next rematch is JOEY_3 only once its group opens", () => {
    const t = game();
    const a = t.join("A", { flags: beatJoey, phone: { contacts: [10], seeking: [10], called: [], pending: [], log: [] } });
    walkAndFace(t, a);
    talk(t, a);
    win(t);
    expect(t.of(a, "trainerBattleEnd").at(-1)).toMatchObject({ result: "won" });
    expect(seeking(t, a)).toBe(false);
    t.session.close("closed-by-host");
    const save = a.saves().at(-1)!.save;
    expect(save.flags).toContain(FLAG_BASE + JOEY_2);
    expect(save.phone.seeking).toEqual([]);

    // Seeking again with group 3 shut: JOEY_2 again. With it open: JOEY_3.
    for (const [groups, want] of [[[], JOEY_2], [[REMATCH_GROUP_FLAG(3)], JOEY_3]] as const) {
      const u = game();
      const c = u.join("A", { flags: [...save.flags, ...groups], phone: { ...save.phone, seeking: [10] } });
      walkAndFace(u, c);
      talk(u, c);
      expect(started(u, c)).toEqual([want]);
    }
  });

  it("an unregistered number gets no rematch: the beaten Joey offers his number instead", () => {
    const t = game();
    const a = t.join("A", { flags: beatJoey });
    walkAndFace(t, a);
    t.press(a, t.BUTTON.interact);
    t.step(5);
    expect(started(t, a)).toEqual([]);
    expect(t.of(a, "script").at(0)?.request).toMatchObject({ kind: "say", text: "0675:4" });
  });
});

// scr_seq_0953.s _0D9F, _0DCF/_0DE4, _0DF9: a trainer with a phone number offers it after the first win and
// again when talked to while it is not registered (his messages 1 and 4); yes registers it, no says message 3.
describe("a trainer's number offer (spec 026, US4)", () => {
  const says = (t: Game, c: Client) => t.of(c, "script").flatMap((m) => (m.request.kind === "say" ? [m.request.text] : []));
  const answerAll = (t: Game, c: Client, yes: boolean) => {
    for (let i = 0; i < 12; i++) {
      for (const m of t.of(c, "script").filter((s) => !answered.has(s.id))) {
        answered.add(m.id);
        c.conn.send({ type: "script-answer", id: m.id, ...(m.request.kind === "yes-no" ? { answer: yes ? 0 : 1 } : {}) });
      }
      t.step();
    }
  };
  const answered = new Set<number>();

  it("after the first win Joey offers his number; yes registers it for this player only", () => {
    answered.clear();
    const t = game();
    const a = t.join("A");
    const b = t.join("B");
    walkAndFace(t, a);
    talk(t, a);
    win(t);
    answerAll(t, a, true);
    expect(says(t, a)).toEqual(["0675:1", "0040:101", "0675:2"]);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.phone.contacts).toEqual([10]);
    // B stood still (and was dropped as silent): their phone book never changed.
    expect(t.of(b, "phone-state").at(-1)?.contacts).toEqual([]);
  });

  it("no keeps it unregistered, and talking to him again asks once more", () => {
    answered.clear();
    const t = game();
    const a = t.join("A", { flags: [FLAG_BASE + JOEY] });
    walkAndFace(t, a);
    t.press(a, t.BUTTON.interact);
    answerAll(t, a, false);
    expect(says(t, a)).toEqual(["0675:4", "0675:3"]);
    t.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.phone.contacts).toEqual([]);
  });
});
