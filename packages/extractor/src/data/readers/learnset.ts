import type { MachineRecord, TutorRecord } from "@soulsilver/shared/game-data";
import { readU16 } from "../../binary.ts";
import type { DataLayout } from "../layout.ts";

// Learnsets, TM/HM, egg moves and tutors; see specs/004-game-data-extraction/research.md R5.

const MAX_MOVE = 467;
const TERMINATOR = 0xffff;
const EGG_MARKER = 20000;
const MACHINE_BITS_OFFSET = 0x1c;
const MACHINE_BITS_BYTES = 16;
const LAST_TM = 92;

const hex = (value: number) => `0x${value.toString(16)}`;

/** `(level << 9) | move` entries in the original order, ended by 0xFFFF. */
export function readLevelUp(bytes: Uint8Array): Array<{ level: number; move: number }> {
  const entries: Array<{ level: number; move: number }> = [];
  for (let offset = 0; offset + 2 <= bytes.length; offset += 2) {
    const value = readU16(bytes, offset);
    if (value === TERMINATOR) return entries;
    entries.push({ level: value >> 9, move: value & 0x1ff });
  }
  throw new Error("Learnset por nível sem terminador 0xFFFF");
}

/** Species marker (20000 + species) followed by its moves; ended by 0xFFFF. */
export function readEggMoves(bytes: Uint8Array): Map<number, number[]> {
  const bySpecies = new Map<number, number[]>();
  let current: number[] | undefined;
  for (let offset = 0; offset + 2 <= bytes.length; offset += 2) {
    const value = readU16(bytes, offset);
    if (value === TERMINATOR) return bySpecies;
    if (value >= EGG_MARKER) {
      current = [];
      bySpecies.set(value - EGG_MARKER, current);
    } else {
      if (!current) throw new Error(`Golpes de ovo: golpe ${value} antes de qualquer espécie, em ${hex(offset)}`);
      current.push(value);
    }
  }
  throw new Error("Golpes de ovo sem terminador 0xFFFF");
}

/** Ids (1–100) of the machines whose bit is set in a personal record. */
export function readMachineCompat(personalBytes: Uint8Array): number[] {
  const machines: number[] = [];
  for (let bit = 0; bit < MACHINE_BITS_BYTES * 8; bit++) {
    const byte = personalBytes[MACHINE_BITS_OFFSET + (bit >> 3)] ?? 0;
    if (byte & (1 << (bit & 7))) machines.push(bit + 1);
  }
  return machines;
}

/** `count` u16 moves, then a 0. Ids 1–92 are TM01–TM92 and 93–100 are HM01–HM08. */
export function readMachines(code: Uint8Array, offset: number, count: number, maxMove = MAX_MOVE): MachineRecord[] {
  const fail = (problem: string) => new Error(`Tabela de TMs/HMs em ${hex(offset)}: ${problem}`);
  if (offset + (count + 1) * 2 > code.length) throw fail("tabela além do fim do código");
  const records: MachineRecord[] = [];
  for (let k = 0; k < count; k++) {
    const move = readU16(code, offset + k * 2);
    if (move < 1 || move > maxMove) throw fail(`golpe ${move} fora de 1–${maxMove} na máquina ${k + 1}`);
    const id = k + 1;
    records.push(id <= LAST_TM ? { id, kind: "tm", number: id, move } : { id, kind: "hm", number: id - LAST_TM, move });
  }
  if (readU16(code, offset + count * 2) !== 0) throw fail("a tabela não termina em 0 depois da última máquina");
  return records;
}

/** Records `{u16 move, u8 cost, u8 area}`. */
export function readTutors(overlay: Uint8Array, offset: number, count: number, maxMove = MAX_MOVE): TutorRecord[] {
  const fail = (problem: string) => new Error(`Lista de tutores em ${hex(offset)}: ${problem}`);
  if (offset + count * 4 > overlay.length) throw fail("lista além do fim do overlay");
  return Array.from({ length: count }, (_, id) => {
    const base = offset + id * 4;
    const move = readU16(overlay, base);
    const area = overlay[base + 3]!;
    if (move < 1 || move > maxMove) throw fail(`golpe ${move} fora de 1–${maxMove} no tutor ${id}`);
    if (area > 3) throw fail(`área ${area} fora de 0–3 no tutor ${id}`);
    return { id, move, cost: overlay[base + 2]!, area };
  });
}

/** Tutors (bit k = tutor k) that the compatibility entry allows. */
export function readTutorCompat(bytes: Uint8Array, entry: number, tutorCount: number): number[] {
  if ((entry + 1) * 8 > bytes.length) throw new Error(`Compatibilidade de tutores: entrada ${entry} além do fim do arquivo`);
  const bits = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(entry * 8, true);
  return Array.from({ length: tutorCount }, (_, k) => k).filter((k) => (bits >> BigInt(k)) & 1n);
}

/** Entry of the tutor compatibility file for a personal record: species first, then the forms. */
export function tutorCompatEntry(layout: DataLayout, personalIndex: number): number | undefined {
  if (personalIndex >= 1 && personalIndex <= layout.counts.species) return personalIndex - 1;
  const form = layout.forms.findIndex((f) => f.personalIndex === personalIndex);
  return form < 0 ? undefined : layout.counts.species + form;
}
