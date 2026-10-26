import type { ItemRecord } from "../game-data/items.ts";

// Using an item on a party member outside combat (spec 017, research R7). Only the potions work for
// now; the rest of the bag comes with spec 24.

/** Byte 1 bit 0: revives a fainted Pokémon. */
const REVIVE = { byte: 1, bit: 0x01 };
/** Byte 5 bit 2: restores HP by the amount in byte 13. */
const RESTORE_HP = { byte: 5, bit: 0x04 };
const AMOUNT_BYTE = 13;
const FULL = 0xff;

/** HP a medicine restores to a conscious Pokémon: a number, "full", or undefined when it is not a potion. */
export function hpRestore(item: Pick<ItemRecord, "pocket" | "partyUse">): number | "full" | undefined {
  if (item.pocket !== "medicine") return undefined;
  const byte = (i: number) => parseInt(item.partyUse.params.slice(i * 2, i * 2 + 2), 16);
  if ((byte(REVIVE.byte) & REVIVE.bit) !== 0 || (byte(RESTORE_HP.byte) & RESTORE_HP.bit) === 0) return undefined;
  const amount = byte(AMOUNT_BYTE);
  return amount === FULL ? "full" : amount > 0 ? amount : undefined;
}
