import { describe, expect, it } from "vitest";
import { readPhoneBook } from "../../src/events/phone.ts";

// Spec 026, T030 (research R7): the phone book from synthetic bytes (principle II). tel/pmtel_book.dat is
// a u32 count and 20-byte PhoneBookEntry records (gear_phone.h); sPhoneMessageGmm is a u16 per contact in
// ARM9; gPhoneCallScriptDef is 6-byte records in overlay 101 (u8 msgIds[2], u16 type:4 | param0:12, u16
// param1), entry 0 empty; sTrainerRematchSets is u16[6] rows in overlay 26.

const JOEY = { id: 10, type: 0, trainerClass: 2, trainer: 8, map: 34, gift: 45, localScript: 29, rematchWeekday: 1, rematchTime: 1, tier: 1 };

function book(entries: (typeof JOEY)[], cut = 0) {
  const b = new Uint8Array(4 + entries.length * 20 - cut);
  const v = new DataView(b.buffer);
  v.setUint32(0, entries.length, true);
  entries.forEach((e, i) => {
    const o = 4 + i * 20;
    if (o + 20 > b.length) return;
    [e.id, e.type, 0, e.trainerClass].forEach((n, k) => v.setUint8(o + k, n));
    [e.trainer, e.map, e.gift, e.localScript].forEach((n, k) => v.setUint16(o + 4 + k * 2, n, true));
    [0, e.rematchWeekday, e.rematchTime, e.tier].forEach((n, k) => v.setUint8(o + 12 + k, n));
  });
  return b;
}
const u16s = (values: number[], at = 8) => {
  const b = new Uint8Array(at + values.length * 2);
  values.forEach((n, i) => new DataView(b.buffer).setUint16(at + i * 2, n, true));
  return b;
};
/** Where sGenericPhoneCallHeaders starts in the synthetic overlay: 16 six-byte records per contact. */
const HEADERS = 64;
/** sGreetingMsgIDs, 8 rows of 12 message ids (bank 640). */
const GREETINGS = HEADERS + 11 * 16 * 6;
/** Joey's incoming headers (phone_generic_headers.c, PHONE_CONTACT_JOEY/2), then NIL. */
const JOEY_IN = [
  { type: 2, chance: 60, scriptType: 0, script: 33 },
  { type: 1, chance: 40, scriptType: 1, script: 30 },
  { type: 1, chance: 100, scriptType: 1, script: 32 },
];
/** Entry 0 empty, then PHONE_SCRIPT_001 (Elm, 1/2) and 002 (Joey's rematch, 10/10, type 3, param0 1); Joey's headers after. */
const scripts = () => {
  const b = new Uint8Array(GREETINGS + 8 * 12);
  // sGreetingMsgIDs: row r is r * 12 + 0..11.
  for (let i = 0; i < 8 * 12; i++) b[GREETINGS + i] = i;
  const at = (i: number) => HEADERS + (10 * 16 + i) * 6;
  // Outgoing: one header, then NONE (255).
  b[at(0)] = 7;
  b[at(0) + 1] = 100;
  new DataView(b.buffer).setUint16(at(0) + 4, 34, true);
  b[at(1)] = 255;
  JOEY_IN.forEach((h, i) => {
    const v = new DataView(b.buffer);
    b[at(8 + i)] = h.type;
    b[at(8 + i) + 1] = h.chance;
    v.setUint16(at(8 + i) + 2, h.scriptType, true);
    v.setUint16(at(8 + i) + 4, h.script, true);
  });
  const v = new DataView(b.buffer);
  [1, 2].forEach((n, k) => v.setUint8(8 + 6 + k, n));
  [10, 10].forEach((n, k) => v.setUint8(8 + 12 + k, n));
  v.setUint16(8 + 14, 3 | (1 << 4), true);
  return b;
};
const layout = { banks: { offset: 8 }, scripts: { offset: 8, count: 3 }, headers: { offset: HEADERS }, greetings: { offset: GREETINGS }, rematch: { offset: 8, count: 1 } };
const trainers = new Set([8, 279, 280, 510]);
const banks = () => u16s(Array.from({ length: 11 }, (_, i) => (i === 10 ? 675 : 640)));

describe("readPhoneBook", () => {
  it("reads the contacts with their bank, the call scripts and the rematch sets", () => {
    const got = readPhoneBook({ book: book([JOEY]), arm9: banks(), overlay101: scripts(), overlay26: u16s([8, 8, 279, 280, 510, 0]) }, layout, trainers);
    expect(got.greetings).toHaveLength(8);
    expect(got.greetings[1]).toEqual([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    // Byte 12 (unkC) is the greeting row; 255 is none.
    expect(got.contacts).toEqual([{ ...JOEY, greeting: 0, bank: 675, outgoing: [{ type: 7, chance: 100, scriptType: 0, script: 34 }], incoming: JOEY_IN }]);
    expect(got.scripts).toEqual([
      { id: 1, lines: [1, 2], type: 0, param0: 0, param1: 0 },
      { id: 2, lines: [10, 10], type: 3, param0: 1, param1: 0 },
    ]);
    expect(got.rematchSets).toEqual([{ base: 8, sequence: [8, 279, 280, 510, 0] }]);
  });

  it("refuses a truncated contact record", () => {
    expect(() => readPhoneBook({ book: book([JOEY, { ...JOEY, id: 11 }], 6), arm9: banks(), overlay101: scripts(), overlay26: u16s([8, 8, 279, 280, 510, 0]) }, layout, trainers)).toThrow(/telefone.*truncad/);
  });

  it("refuses a contact whose trainer is not in the trainer table", () => {
    expect(() => readPhoneBook({ book: book([{ ...JOEY, trainer: 9 }]), arm9: banks(), overlay101: scripts(), overlay26: u16s([8, 8, 279, 280, 510, 0]) }, layout, trainers)).toThrow(/telefone.*contato 10.*treinador 9/);
  });

  it("refuses a rematch step that is not a trainer", () => {
    expect(() => readPhoneBook({ book: book([JOEY]), arm9: banks(), overlay101: scripts(), overlay26: u16s([8, 8, 279, 281, 510, 0]) }, layout, trainers)).toThrow(/telefone.*revanche.*281/);
  });

  it("refuses a table past the end of its code", () => {
    expect(() => readPhoneBook({ book: book([JOEY]), arm9: banks(), overlay101: scripts(), overlay26: u16s([8, 8, 279]) }, layout, trainers)).toThrow(/telefone.*fora/);
  });
});
