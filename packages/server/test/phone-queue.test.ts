import { createRng, type ServerMessage } from "@soulsilver/shared/game";
import type { PhoneBook, PhoneContact } from "@soulsilver/shared/phone";
import { newPhone, type PhoneSave } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { createPhone } from "../src/phone";
import { createWorld } from "../src/world";

// Spec 026, T034 (layer 2): the Pokégear rings on the player's tile steps (research R7.3) and never while they
// are busy: in combat, in a cutscene or in a menu all read as `busy`, and the call waits until they are free.
// A story call stays in the save until answered; a random one is lost with the session.

const contact = (id: number, tier: number): PhoneContact => ({ id, type: 0, trainerClass: 0, trainer: 0, map: 100 + id, gift: 0, localScript: 0, rematchWeekday: 7, rematchTime: 3, tier, greeting: 255, bank: 640, outgoing: [], incoming: [{ type: 1, chance: 100, scriptType: 1, script: 30 }] });
const BOOK: PhoneBook = {
  contacts: [contact(10, 0), contact(11, 1), contact(12, 2), { ...contact(1, 0), type: 2, bank: 716, map: 61, incoming: [] }],
  scripts: [
    { id: 2, lines: [33, 34], type: 0, param0: 0, param1: 0 },
    { id: 3, lines: [35, 36], type: 0, param0: 0, param1: 0 },
    { id: 30, lines: [6, 7], type: 0, param0: 0, param1: 0 },
  ],
  greetings: [], rematchSets: [],
};
const BANDS = { morning: 4, day: 10, night: 20 };
type Call = Extract<ServerMessage, { type: "phone-call" }>;

function game(over: Partial<PhoneSave> = {}, area = "1") {
  const world = createWorld();
  const me = world.add({ kind: "player", area, x: 8, y: 8, level: 0, facing: "east", data: {} });
  let busy = false;
  const got: ServerMessage[] = [];
  const phone = createPhone({ book: BOOK, world, rng: createRng(3), weekday: () => 1, hour: () => 12, bands: BANDS, rings: (a) => a !== "2", busy: () => busy, now: () => "2026-11-07T12:00:00.000Z" });
  const save: PhoneSave = { ...newPhone(), contacts: [10, 11, 12, 1], ...over };
  const join = () => phone.join({ playerId: 1, entityId: me.id, character: "male", phone: save, flags: new Set(), send: (m) => void got.push(m) });
  join();
  const walk = (tiles: number) => {
    for (let i = 0; i < tiles; i++) {
      const e = world.get(me.id)!;
      world.update({ ...e, x: e.x + 16 });
      phone.step();
    }
  };
  const calls = () => got.filter((m): m is Call => m.type === "phone-call");
  return { phone, save, walk, calls, join, setBusy: (b: boolean) => (busy = b), got };
}

describe("the phone's queue (spec 026, US4)", () => {
  it("rings after enough steps with a contact's own text", () => {
    const g = game();
    g.walk(200);
    const call = g.calls()[0]!;
    expect(call).toMatchObject({ direction: "in", lines: ["0640:6"] });
    expect([10, 11, 12]).toContain(call.contact);
  });

  it.each(["combat", "a cutscene", "the menu"])("a call due during %s rings only once the player is free", () => {
    const g = game();
    g.setBusy(true);
    g.walk(200);
    expect(g.calls()).toHaveLength(0);
    g.setBusy(false);
    g.phone.step();
    expect(g.calls()).toHaveLength(1);
  });

  it("a ringing call holds the next: one at a time, each after the answer, in order", () => {
    const g = game({ pending: [{ caller: 1, call: 2 }, { caller: 1, call: 3 }] });
    g.walk(200);
    expect(g.calls()).toHaveLength(1);
    expect(g.phone.answer(1, g.calls()[0]!.callId)).toBe(true);
    g.walk(200);
    expect(g.calls()).toHaveLength(2);
    expect(g.calls().map((c) => c.lines[0])).toEqual(["0716:33", "0716:35"]);
  });

  it("answering logs the call and ends it; a wrong id is refused", () => {
    const g = game();
    g.walk(200);
    const call = g.calls()[0]!;
    expect(g.phone.answer(1, call.callId + 1)).toBe(false);
    expect(g.phone.answer(1, call.callId)).toBe(true);
    expect(g.phone.answer(1, call.callId)).toBe(false);
    expect(g.save.log).toEqual([{ contact: call.contact, direction: "in", at: "2026-11-07T12:00:00.000Z" }]);
  });

  it("a story call stays in the save until answered and rings again after a reconnect", () => {
    const g = game({ pending: [{ caller: 1, call: 2 }] });
    g.walk(200);
    expect(g.calls().at(-1)!.contact).toBe(1);
    g.phone.leave(1);
    expect(g.save.pending).toEqual([{ caller: 1, call: 2 }]);
    g.join();
    g.walk(200);
    const again = g.calls().at(-1)!;
    expect(again.contact).toBe(1);
    g.phone.answer(1, again.callId);
    expect(g.save.pending).toEqual([]);
  });

  it("a random call held while busy is lost with the session", () => {
    const g = game();
    g.setBusy(true);
    g.walk(200);
    g.phone.leave(1);
    g.join();
    g.setBusy(false);
    g.phone.step();
    expect(g.calls()).toHaveLength(0);
  });

  it("never rings on a map that takes no calls", () => {
    const g = game({}, "2");
    g.walk(400);
    expect(g.calls()).toHaveLength(0);
  });
});

// phone_scripts_generic.c GearPhoneCall_Generic and PhoneCall_InitMsgDataAndBufferNames: 0 the player, 1 the
// contact's name, 2 and 3 the places of the player and of the contact, and for a trainer 10 a Pokémon of their
// team and 11 a wild species of their map at this time of day (a Good Rod one for a Fisherman).
describe("a call's text buffers (spec 026, FR-010)", () => {
  it("fills what the original's lines read", () => {
    const world = createWorld();
    const me = world.add({ kind: "player", area: "1", x: 8, y: 8, level: 0, facing: "east", data: {} });
    const got: ServerMessage[] = [];
    const joey = { ...contact(10, 0), trainer: 8, map: 34, bank: 675 };
    const book: PhoneBook = { ...BOOK, contacts: [joey] };
    const phone = createPhone({
      book,
      world,
      rng: createRng(3),
      weekday: () => 1,
      hour: () => 12,
      bands: BANDS,
      rings: () => true,
      busy: () => false,
      now: () => "2026-11-07T12:00:00.000Z",
      mapsec: (area) => (area === "1" ? 126 : area === "34" ? 130 : undefined),
      team: (t) => (t === 8 ? [19] : []),
      wild: (map, band, fisherman) => (map === 34 && band === 1 && !fisherman ? [16, 161] : []),
    });
    phone.join({ playerId: 1, entityId: me.id, character: "male", phone: { ...newPhone(), contacts: [10] }, flags: new Set(), send: (m) => void got.push(m) });
    for (let i = 0; i < 200 && !got.some((m) => m.type === "phone-call"); i++) {
      const e = world.get(me.id)!;
      world.update({ ...e, x: e.x + 16 });
      phone.step();
    }
    const call = got.find((m): m is Call => m.type === "phone-call")!;
    expect(call.buffers).toMatchObject({ 0: { kind: "player" }, 1: { kind: "text", text: "0675:0" }, 2: { kind: "place", mapsec: 126 }, 3: { kind: "place", mapsec: 130 }, 10: { kind: "species", id: 19 } });
    expect([16, 161]).toContain((call.buffers![11] as { id: number }).id);
  });
});

// PhoneCall_PrintGreeting: unless the contact's row is 255, a call opens with sGreetingMsgIDs[row][band * 2 + incoming * 6]
// (+ 1 for a female player), bank 640.
describe("a call's greeting (spec 026, FR-010)", () => {
  it("opens with the greeting of the row, the direction and the time band", () => {
    const world = createWorld();
    const me = world.add({ kind: "player", area: "1", x: 8, y: 8, level: 0, facing: "east", data: {} });
    const got: ServerMessage[] = [];
    const row = Array.from({ length: 12 }, (_, i) => 100 + i);
    const book: PhoneBook = { ...BOOK, contacts: [{ ...contact(10, 0), greeting: 1 }], greetings: [row.map((x) => x - 50), row] };
    const phone = createPhone({ book, world, rng: createRng(3), weekday: () => 1, hour: () => 12, bands: BANDS, rings: () => true, busy: () => false, now: () => "2026-11-07T12:00:00.000Z" });
    phone.join({ playerId: 1, entityId: me.id, character: "male", phone: { ...newPhone(), contacts: [10] }, flags: new Set(), send: (m) => void got.push(m) });
    for (let i = 0; i < 200 && !got.some((m) => m.type === "phone-call"); i++) {
      const e = world.get(me.id)!;
      world.update({ ...e, x: e.x + 16 });
      phone.step();
    }
    // Day (band 1), incoming: 1 * 2 + 6 = 8.
    expect(got.find((m): m is Call => m.type === "phone-call")!.lines).toEqual(["0640:108", "0640:6"]);
  });
});

// content/phone/callers.json: calling Prof. Elm and Mom plays their own rules (phone_scripts_prof_elm.c,
// phone_scripts_mother.c), the first that holds.
describe("calling Elm and Mom (spec 026, FR-009)", () => {
  const ELM_SCRIPTS = [1, 8, 9, 10, 11, 12, 13, 14, 15, 23, 25, 26].map((id) => ({ id, lines: [id, id] as [number, number], type: 0, param0: 0, param1: 0 }));
  const book: PhoneBook = {
    contacts: [
      { ...contact(1, 0), type: 2, map: 61, bank: 716 },
      { ...contact(0, 0), type: 1, map: 63, bank: 664 },
    ],
    scripts: ELM_SCRIPTS,
    greetings: [],
    rematchSets: [],
  };
  const dial = (caller: number, flags: number[], area = "1") => {
    const world = createWorld();
    const me = world.add({ kind: "player", area, x: 8, y: 8, level: 0, facing: "east", data: {} });
    const got: ServerMessage[] = [];
    const phone = createPhone({ book, world, rng: createRng(3), weekday: () => 1, hour: () => 12, bands: BANDS, rings: () => true, busy: () => false, now: () => "2026-11-07T12:00:00.000Z" });
    phone.join({ playerId: 1, entityId: me.id, character: "male", phone: { ...newPhone(), contacts: [0, 1] }, flags: new Set(flags), send: (m) => void got.push(m) });
    const ok = phone.dial(1, caller);
    return ok ? got.find((m): m is Call => m.type === "phone-call")!.lines.at(-1) : undefined;
  };
  const PANIC = 0xee;
  const RIVAL = 0x79;
  const EGG_CALL = 0x9f;
  const EGG = 0x70;
  const HATCHED = 0x983;
  const EVERSTONE = 0x11a;
  const TALKED_TO_MOM = 0xa7;

  it.each([
    ["on his map", [], "61", "0716:1"],
    ["before the panic call", [], "1", "0716:8"],
    ["before the officer heard the rival's name", [PANIC], "1", "0716:9"],
    ["before the egg call", [PANIC, RIVAL], "1", "0716:10"],
    ["before the aide's egg", [PANIC, RIVAL, EGG_CALL], "1", "0716:11"],
    ["with the egg not hatched", [PANIC, RIVAL, EGG_CALL, EGG], "1", "0716:12"],
    ["once it hatched", [PANIC, RIVAL, EGG_CALL, EGG, HATCHED], "1", "0716:13"],
  ] as const)("Elm %s", (_, flags, area, line) => {
    expect(dial(1, [...flags], area)).toBe(line);
  });

  it("Elm with the Everstone given plays one of his two later lines", () => {
    expect(["0716:14", "0716:15"]).toContain(dial(1, [PANIC, RIVAL, EGG_CALL, EGG, HATCHED, EVERSTONE]));
  });

  it("Mom before and after the rival's name, then her savings question", () => {
    expect(dial(0, [])).toBe("0664:25");
    expect(dial(0, [RIVAL])).toBe("0664:26");
    expect(dial(0, [RIVAL, TALKED_TO_MOM])).toBe("0664:28");
  });
});

// PhoneCall_ApplyGenericNPCcallSideEffect: UNK1 and FLAG set (param0 1) or clear (0) the flag param1; WORD puts
// message param1 + LCRandom() % param0 of the contact's bank in buffer 4.
describe("a call's side effects (spec 026, FR-010)", () => {
  const ring = (script: { type: number; param0: number; param1: number }, flags = new Set<number>()) => {
    const world = createWorld();
    const me = world.add({ kind: "player", area: "1", x: 8, y: 8, level: 0, facing: "east", data: {} });
    const got: ServerMessage[] = [];
    const book: PhoneBook = { ...BOOK, contacts: [contact(10, 0)], scripts: [{ id: 30, lines: [6, 7], ...script }] };
    const phone = createPhone({ book, world, rng: createRng(3), weekday: () => 1, hour: () => 12, bands: BANDS, rings: () => true, busy: () => false, now: () => "2026-11-07T12:00:00.000Z" });
    phone.join({ playerId: 1, entityId: me.id, character: "male", phone: { ...newPhone(), contacts: [10] }, flags, send: (m) => void got.push(m) });
    for (let i = 0; i < 200 && !got.some((m) => m.type === "phone-call"); i++) {
      const e = world.get(me.id)!;
      world.update({ ...e, x: e.x + 16 });
      phone.step();
    }
    const call = got.find((m): m is Call => m.type === "phone-call")!;
    phone.answer(1, call.callId);
    return { call, flags };
  };

  it.each([1, 2])("type %i with param0 1 sets the flag, with 0 clears it", (type) => {
    expect(ring({ type, param0: 1, param1: 500 }).flags.has(500)).toBe(true);
    expect(ring({ type, param0: 0, param1: 500 }, new Set([500])).flags.has(500)).toBe(false);
  });

  it("WORD fills buffer 4 with one of the contact's messages", () => {
    const { call } = ring({ type: 5, param0: 3, param1: 20 });
    expect(["0640:20", "0640:21", "0640:22"]).toContain((call.buffers![4] as { text: string }).text);
  });
});

// GearPhoneCall_Mother (phone_scripts_mother.c): her calls ask whether to save money (msg_0271 8 and 9); yes sets
// FLAG_SYS_MOMS_SAVINGS and she says 25, no clears it and she says 26.
describe("Mom's savings question (spec 026, FR-009)", () => {
  const SAVINGS = 0x986;
  const mom = (flags: number[], area = "1") => {
    const world = createWorld();
    const me = world.add({ kind: "player", area, x: 8, y: 8, level: 0, facing: "east", data: {} });
    const got: ServerMessage[] = [];
    const book: PhoneBook = { ...BOOK, contacts: [{ ...contact(0, 0), type: 1, map: 63, bank: 664 }], scripts: [] };
    const set = new Set(flags);
    const phone = createPhone({ book, world, rng: createRng(3), weekday: () => 1, hour: () => 12, bands: BANDS, rings: () => true, busy: () => false, now: () => "2026-11-07T12:00:00.000Z" });
    phone.join({ playerId: 1, entityId: me.id, character: "male", phone: { ...newPhone(), contacts: [0] }, flags: set, send: (m) => void got.push(m) });
    const calls = () => got.filter((m): m is Call => m.type === "phone-call");
    return { phone, calls, flags: set };
  };

  it("calling her after the rival's name asks the question; yes turns savings on and she answers", () => {
    const m = mom([0x79, 0xa7]);
    expect(m.phone.dial(1, 0)).toBe(true);
    const ask = m.calls()[0]!;
    expect(ask).toMatchObject({ lines: ["0664:7", "0664:28"], choices: ["0271:8", "0271:9"] });
    expect(m.phone.answer(1, ask.callId)).toBe(false);
    expect(m.phone.answer(1, ask.callId, 0)).toBe(true);
    expect(m.flags.has(SAVINGS)).toBe(true);
    const reply = m.calls()[1]!;
    expect(reply.lines).toEqual(["0664:25"]);
    expect(reply.choices).toBeUndefined();
    expect(m.phone.answer(1, reply.callId)).toBe(true);
  });

  it("with savings on she asks the other prompt, and no turns them off", () => {
    const m = mom([0x79, 0xa7, SAVINGS]);
    m.phone.dial(1, 0);
    const ask = m.calls()[0]!;
    expect(ask.lines.at(-1)).toBe("0664:27");
    m.phone.answer(1, ask.callId, 1);
    expect(m.flags.has(SAVINGS)).toBe(false);
    expect(m.calls()[1]!.lines).toEqual(["0664:26"]);
  });

  it("her call from a script (Route 30, 227:4) asks with prompt 22", () => {
    const m = mom([]);
    expect(m.phone.scriptedCall(1, 0, 0)).toBe(true);
    expect(m.calls()[0]).toMatchObject({ lines: ["0664:22"], choices: ["0271:8", "0271:9"] });
  });
});
