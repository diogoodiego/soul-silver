import type { ItemRecord } from "@soulsilver/shared/game-data";
import { hpRestore, type NoticeCode } from "@soulsilver/shared/game";
import type { PartyMember, Save } from "@soulsilver/shared/save";

// Bag items used from the menu, and the party order (spec 017, research R7). Both are refused in
// combat; the session checks that before calling here.

export type ItemData = Pick<ItemRecord, "id" | "pocket" | "partyUse">;

export interface ItemsData {
  item(id: number): ItemData | undefined;
}

export function buildItemsData(records: ItemData[]): ItemsData {
  const byId = new Map(records.map((r) => [r.id, r]));
  return { item: (id) => byId.get(id) };
}

/** Uses `item` on party member `index`; undefined when it worked, else the notice to send. Nothing changes on refusal. */
export function useItem(progress: Pick<Save, "party" | "bag">, item: number, index: number, data: ItemsData | undefined, hpMax: (m: PartyMember) => number): NoticeCode | undefined {
  const entry = progress.bag.find((b) => b.item === item);
  const member = progress.party[index];
  if (!entry || !member) return "action-refused";
  const record = data?.item(item);
  const amount = record ? hpRestore(record) : undefined;
  if (amount === undefined) return "item-unavailable";
  const max = hpMax(member);
  if (member.hp === 0 || member.hp >= max) return "action-refused";
  member.hp = amount === "full" ? max : Math.min(max, member.hp + amount);
  entry.count--;
  progress.bag = progress.bag.filter((b) => b.count > 0);
  return undefined;
}

/** Moves party member `from` to slot `to`; false for a bad index or the same slot. */
export function reorderParty(party: PartyMember[], from: number, to: number): boolean {
  if (from === to || from >= party.length || to >= party.length) return false;
  const [m] = party.splice(from, 1);
  party.splice(to, 0, m!);
  return true;
}
