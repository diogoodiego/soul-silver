import { ROCK_SMASH_ITEM_LISTS, type RockSmashRecord } from "@soulsilver/shared/events";
import { readU16 } from "../binary.ts";

// Rock Smash items of one map (spec 025): NARC a/2/5/3, one 4-byte member per map, u16 odds (percent)
// then u16 item list (ROCK_SMASH, rock_smash_item.c). Null when the map's rocks hold nothing.

export function readRockSmash(b: Uint8Array, mapId: number): RockSmashRecord | null {
  if (b.length !== 4) throw new Error(`rock smash ${mapId}: has ${b.length} bytes, expected 4`);
  const odds = readU16(b, 0);
  const type = readU16(b, 2);
  if (odds > 100) throw new Error(`rock smash ${mapId}: odds ${odds} over 100`);
  const items = ROCK_SMASH_ITEM_LISTS[type];
  if (!items) throw new Error(`rock smash ${mapId}: item list ${type} unknown`);
  return odds === 0 ? null : { id: mapId, odds, items };
}
