// Reader of the phone book (spec 026, research R7): tel/pmtel_book.dat (gear_phone.h PhoneBookEntry),
// the message bank of each contact (sPhoneMessageGmm, phonebook_dat.c, ARM9), the call scripts
// (gPhoneCallScriptDef, phone_script_defs.c, overlay 101) and the rematch sets (sTrainerRematchSets,
// overlay_26_022598C0.c). Found and checked in the US ROM.
import { REMATCH_NONE, REMATCH_SKIP, type PhoneBook } from "@soulsilver/shared/phone";
import { readU16 } from "../binary.ts";

const ENTRY = 20;
const SCRIPT = 6;
const REMATCH_ROW = 12;
const HEADER = 6;
const GREETING_ROWS = 8;
/** PHONECALLGENERIC_NIL and _NONE end a contact's list. */
const HEADER_ENDS = new Set([0, 255]);

function readHeaders(code: Uint8Array, at: number): PhoneBook["contacts"][number]["incoming"] {
  const out: PhoneBook["contacts"][number]["incoming"] = [];
  for (let i = 0; i < 8; i++) {
    const o = at + i * HEADER;
    if (HEADER_ENDS.has(code[o]!)) break;
    out.push({ type: code[o]!, chance: code[o + 1]!, scriptType: readU16(code, o + 2), script: readU16(code, o + 4) });
  }
  return out;
}

export interface PhoneLayout {
  banks: { offset: number };
  scripts: { offset: number; count: number };
  /** sGenericPhoneCallHeaders: 16 records per contact, outgoing then incoming. */
  headers: { offset: number };
  /** sGreetingMsgIDs: 8 rows of 12 u8. */
  greetings: { offset: number };
  rematch: { offset: number; count: number };
}

const fits = (code: Uint8Array, offset: number, bytes: number, what: string) => {
  if (offset + bytes > code.length) throw new Error(`telefone: ${what} 0x${offset.toString(16)} fora do código`);
};

export function readPhoneBook(input: { book: Uint8Array; arm9: Uint8Array; overlay101: Uint8Array; overlay26: Uint8Array }, layout: PhoneLayout, trainers: Set<number>): PhoneBook {
  const { book, arm9, overlay101, overlay26 } = input;
  const count = book.length >= 4 ? new DataView(book.buffer, book.byteOffset, book.byteLength).getUint32(0, true) : 0;
  if (book.length < 4 + count * ENTRY) throw new Error(`telefone: pmtel_book.dat truncado (${count} contatos, ${book.length} bytes)`);
  const contacts: PhoneBook["contacts"] = [];
  for (let i = 0; i < count; i++) {
    const o = 4 + i * ENTRY;
    const id = book[o]!;
    const trainer = readU16(book, o + 4);
    if (trainer !== 0 && !trainers.has(trainer)) throw new Error(`telefone: contato ${id} aponta para o treinador ${trainer}, que não existe`);
    fits(arm9, layout.banks.offset + id * 2, 2, "banco do contato");
    const headers = layout.headers.offset + id * 16 * HEADER;
    fits(overlay101, headers, 16 * HEADER, "roteiros do contato");
    contacts.push({
      id,
      type: book[o + 1]!,
      trainerClass: book[o + 3]!,
      trainer,
      map: readU16(book, o + 6),
      gift: readU16(book, o + 8),
      localScript: readU16(book, o + 10),
      rematchWeekday: book[o + 13]!,
      rematchTime: book[o + 14]!,
      tier: book[o + 15]!,
      greeting: book[o + 12]!,
      bank: readU16(arm9, layout.banks.offset + id * 2),
      outgoing: readHeaders(overlay101, headers),
      incoming: readHeaders(overlay101, headers + 8 * HEADER),
    });
  }

  fits(overlay101, layout.scripts.offset, layout.scripts.count * SCRIPT, "tabela de roteiros");
  const scripts: PhoneBook["scripts"] = [];
  // Entry 0 is the table's empty one.
  for (let id = 1; id < layout.scripts.count; id++) {
    const o = layout.scripts.offset + id * SCRIPT;
    const bits = readU16(overlay101, o + 2);
    scripts.push({ id, lines: [overlay101[o]!, overlay101[o + 1]!], type: bits & 0xf, param0: bits >> 4, param1: readU16(overlay101, o + 4) });
  }

  fits(overlay26, layout.rematch.offset, layout.rematch.count * REMATCH_ROW, "tabela de revanches");
  const rematchSets: PhoneBook["rematchSets"] = [];
  for (let i = 0; i < layout.rematch.count; i++) {
    const row = Array.from({ length: 6 }, (_, k) => readU16(overlay26, layout.rematch.offset + i * REMATCH_ROW + k * 2));
    for (const t of row) if (t !== REMATCH_NONE && t !== REMATCH_SKIP && !trainers.has(t)) throw new Error(`telefone: revanche ${i} aponta para o treinador ${t}, que não existe`);
    rematchSets.push({ base: row[0]!, sequence: [row[1]!, row[2]!, row[3]!, row[4]!, row[5]!] });
  }
  fits(overlay101, layout.greetings.offset, GREETING_ROWS * 12, "tabela de cumprimentos");
  const greetings = Array.from({ length: GREETING_ROWS }, (_, r) => [...overlay101.subarray(layout.greetings.offset + r * 12, layout.greetings.offset + r * 12 + 12)]);
  return { contacts, scripts, rematchSets, greetings };
}
