// Readers of the items the field holds (spec 027): hidden items, apricorn trees and berry growth.
// Offsets in layout.ts; the formats are in specs/027-items/research.md, "Resultados da sondagem".
import type { FieldItemsFile } from "@soulsilver/shared/events";
import { readU16 } from "../binary.ts";

const HIDDEN_RECORD = 8;
/** GetHiddenItemParams: the flag is the script id − 7200, that is 800 + the index (script − 8000). */
const HIDDEN_FLAG_BASE = 800;
const BERRY_RECORD = 12;
const BERRY_HOURS = 4;
const CHERI_BERRY = 149;

function inside(bytes: Uint8Array, offset: number, length: number, what: string): void {
  if (offset + length > bytes.length) throw new Error(`${what}: tabela 0x${offset.toString(16)} fora da ARM9`);
}

export function readHiddenItems(arm9: Uint8Array, table: { offset: number; count: number }): FieldItemsFile["hidden"] {
  inside(arm9, table.offset, table.count * HIDDEN_RECORD, "itens escondidos");
  return Array.from({ length: table.count }, (_, i) => {
    const at = table.offset + i * HIDDEN_RECORD;
    const item = readU16(arm9, at);
    const count = arm9[at + 2]!;
    if (item < 1 || count < 1) throw new Error(`itens escondidos: registro ${i} sem item ou quantidade`);
    const index = readU16(arm9, at + 6);
    return { index, item, count, flag: HIDDEN_FLAG_BASE + index };
  }).sort((a, b) => a.index - b.index);
}

export function readApricornTrees(arm9: Uint8Array, table: { offset: number; count: number }): number[] {
  inside(arm9, table.offset, table.count, "árvores de apricorn");
  const colours = [...arm9.subarray(table.offset, table.offset + table.count)];
  const bad = colours.findIndex((c) => c > 6);
  if (bad !== -1) throw new Error(`árvores de apricorn: a árvore ${bad} tem a cor ${colours[bad]}, acima de 6`);
  return colours;
}

/** One NARC member per berry, Cheri Berry first. */
export function readBerryGrowth(members: Uint8Array[]): FieldItemsFile["berries"] {
  return members.map((m, i) => {
    if (m.length < BERRY_RECORD) throw new Error(`dados de berry: membro ${i} com ${m.length} bytes, esperado ${BERRY_RECORD}`);
    return { item: CHERI_BERRY + i, hoursPerStage: Math.max(1, m[BERRY_HOURS]!) };
  });
}
