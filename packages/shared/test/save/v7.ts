import { newBoxes, newItemState, type PartyMember } from "../../src/save/schema.ts";

/**
 * What 6 → 7, 7 → 8 and 8 → 9 make of a v6 save: storage into box 1, an empty PC item storage, no
 * rival name, a stale story, and the badge count as a set with no visited fly points.
 */
export function v7<S extends { storage: unknown[]; badges: number }>({ storage, badges, ...save }: S) {
  const boxes = newBoxes();
  storage.forEach((m, i) => (boxes[0]!.slots[i] = m as PartyMember));
  return { ...save, schemaVersion: 15, daycare: [], daycareEgg: false, eggWalk: 0, photos: [], boxes, pcItems: [], rivalName: "", storyRev: 0, badgeSet: (1 << badges) - 1, flyPoints: [], phone: { contacts: [], seeking: [], called: [], pending: [], log: [] }, ...newItemState() };
}
