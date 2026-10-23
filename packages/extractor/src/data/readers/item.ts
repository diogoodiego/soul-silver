import { type ItemRecord, POCKET_KEYS } from "@soulsilver/shared/game-data";
import { readU16 } from "../../binary.ts";

// Item data (34 bytes) and the item id → data index map; see research R7.

const RECORD_SIZE = 34;
const MAP_ENTRY_SIZE = 8;

/** Data index of each item id from 0 to `maxId`. Unused ids point to data 0. */
export function readItemMap(code: Uint8Array, offset: number, maxId: number, memberCount: number): number[] {
  const fail = (problem: string) => new Error(`Mapa de itens em 0x${offset.toString(16)}: ${problem}`);
  if (offset + (maxId + 1) * MAP_ENTRY_SIZE > code.length) throw fail("tabela além do fim do código");
  const map = Array.from({ length: maxId + 1 }, (_, id) => readU16(code, offset + id * MAP_ENTRY_SIZE));
  if (map[0] !== 0) throw fail(`o item 0 deveria apontar para o dado 0, aponta para ${map[0]}`);
  const bad = map.findIndex((index) => index > memberCount - 1);
  if (bad >= 0) throw fail(`o item ${bad} aponta para o dado ${map[bad]}, mas só existem ${memberCount} dados`);
  return map;
}

export function readItem(bytes: Uint8Array, id: number, dataIndex: number): ItemRecord {
  if (bytes.length < RECORD_SIZE) throw new Error(`Registro de item ${id} com ${bytes.length} bytes (esperado ${RECORD_SIZE})`);
  const at = (offset: number) => bytes[offset]!;
  const bits = readU16(bytes, 8);
  const pocket = POCKET_KEYS[(bits >> 7) & 0xf];
  if (pocket === undefined) throw new Error(`Bolso desconhecido (${(bits >> 7) & 0xf}) no item ${id}`);
  const params = Array.from(bytes.subarray(0x0e, 0x0e + 20), (byte) => byte.toString(16).padStart(2, "0")).join("");

  return {
    id,
    dataIndex,
    name: { catalog: "item-names", index: id },
    price: readU16(bytes, 0),
    pocket,
    battlePockets: bits >> 11,
    holdEffect: { id: at(2), parameter: at(3) },
    fling: { effect: at(5), power: at(6) },
    naturalGift: { power: at(7), type: bits & 31 },
    pluckEffect: at(4),
    preventToss: (bits & (1 << 5)) !== 0,
    selectable: (bits & (1 << 6)) !== 0,
    fieldUse: at(0x0a),
    battleUse: at(0x0b),
    partyUse: { kind: at(0x0c), params },
  };
}
