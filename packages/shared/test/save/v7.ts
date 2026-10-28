import { newBoxes, type PartyMember } from "../../src/save/schema.ts";

/** What 6 → 7 makes of a v6 save: storage into box 1, an empty PC item storage. */
export function v7<S extends { storage: unknown[] }>({ storage, ...save }: S) {
  const boxes = newBoxes();
  storage.forEach((m, i) => (boxes[0]!.slots[i] = m as PartyMember));
  return { ...save, schemaVersion: 7, boxes, pcItems: [] };
}
