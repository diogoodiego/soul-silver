// Readers of the Poké Mart tables (spec 023, research R1). Common mart: sNormalMartItems in ARM9,
// (item, rank) u16 pairs; MartBuy turns the badge count into a rank with a switch, and offers the
// items whose rank is at most that. Special marts: a table of pointers to u16 item lists ending in
// 0xFFFF, indexed by the SpecialMartBuy argument. Found and checked in the US ROM.
import { COMMON_MART, type ShopRecord } from "@soulsilver/shared/events";
import { readU16, readU32 } from "../binary.ts";

const ARM9_BASE = 0x02000000;
const LIST_END = 0xffff;

export interface ShopLayout {
  normal: number;
  normalCount: number;
  special: number;
  specialCount: number;
  /** Rank by badge count 0..n; more badges than that use the last. */
  badgeRank: readonly number[];
}

export function readShops(arm9: Uint8Array, layout: ShopLayout): ShopRecord[] {
  const minBadges = (rank: number) => {
    const badges = layout.badgeRank.findIndex((r) => r >= rank);
    if (badges < 0) throw new Error(`Poké Mart comum: nenhuma contagem de insígnias chega ao nível ${rank}`);
    return badges;
  };
  const normal: ShopRecord = {
    id: COMMON_MART,
    items: Array.from({ length: layout.normalCount }, (_, i) => ({ item: readU16(arm9, layout.normal + i * 4), minBadges: minBadges(readU16(arm9, layout.normal + i * 4 + 2)) })),
  };
  const special = Array.from({ length: layout.specialCount }, (_, id): ShopRecord => {
    const at = readU32(arm9, layout.special + id * 4) - ARM9_BASE;
    if (at < 0 || at >= arm9.length) throw new Error(`loja especial ${id}: ponteiro fora da ARM9`);
    const items: ShopRecord["items"] = [];
    for (let i = at; readU16(arm9, i) !== LIST_END; i += 2) items.push({ item: readU16(arm9, i), minBadges: 0 });
    return { id: id + 1, items };
  });
  return [normal, ...special];
}
