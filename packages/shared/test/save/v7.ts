import { newBoxes, type PartyMember } from "../../src/save/schema.ts";

/**
 * What 6 → 7 and 7 → 8 make of a v6 save: storage into box 1, an empty PC item storage, no rival
 * name and a stale story.
 */
export function v7<S extends { storage: unknown[] }>({ storage, ...save }: S) {
  const boxes = newBoxes();
  storage.forEach((m, i) => (boxes[0]!.slots[i] = m as PartyMember));
  return { ...save, schemaVersion: 8, boxes, pcItems: [], rivalName: "", storyRev: 0 };
}
