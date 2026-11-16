import type { NpcTradeRecord } from "@soulsilver/shared/events";
import { formatTextId } from "@soulsilver/shared/text";

// Item 030.10: the in-game trades, NARC a/1/1/2, one NPCTrade (npc_trade.h) per trade: 21 little-endian u32
// fields. The nickname is text `id` of the trade names bank, the trainer's name text id + NPC_TRADE_MAX.

const SIZE = 0x54;
/** NPC_TRADE_MAX: the trainers' names follow the 13 nicknames in the bank. */
const TRADE_COUNT = 13;
const FIELD = { give: 0, ivs: 1, otId: 8, pid: 14, item: 15, gender: 16, ask: 19 } as const;

export function readNpcTrade(b: Uint8Array, id: number, namesBank: number): NpcTradeRecord {
  if (b.length !== SIZE) throw new Error(`npc trade ${id}: has ${b.length} bytes, expected ${SIZE}`);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const word = (i: number) => view.getUint32(i * 4, true);
  const [hp, attack, defense, speed, specialAttack, specialDefense] = [0, 1, 2, 3, 4, 5].map((i) => word(FIELD.ivs + i));
  const ivs = { hp: hp!, attack: attack!, defense: defense!, speed: speed!, specialAttack: specialAttack!, specialDefense: specialDefense! };
  if (Object.values(ivs).some((v) => v > 31)) throw new Error(`npc trade ${id}: IV over 31`);
  return {
    id,
    give: word(FIELD.give),
    ask: word(FIELD.ask),
    ivs,
    pid: word(FIELD.pid),
    otId: word(FIELD.otId),
    heldItem: word(FIELD.item),
    otGender: word(FIELD.gender),
    nickname: formatTextId(namesBank, id),
    ot: formatTextId(namesBank, id + TRADE_COUNT),
  };
}
