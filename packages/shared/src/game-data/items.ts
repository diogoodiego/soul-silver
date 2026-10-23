import { z } from "zod";
import { fileSchema, id, int, textRef } from "./common.ts";

// items.json; see data-model.md and research R7. "Original effect" fields are raw ids.

export const POCKET_KEYS = ["items", "medicine", "balls", "machines", "berries", "mail", "battle-items", "key-items"] as const;
export type PocketKey = (typeof POCKET_KEYS)[number];

const byte = int(0, 255);

export const itemRecord = z.strictObject({
  /** The item id in the game. */
  id: id(),
  /** Member of the item data NARC, for traceability. */
  dataIndex: id(),
  name: textRef("item-names"),
  price: int(0, 65535),
  pocket: z.enum(POCKET_KEYS),
  /** Which battle bag pockets list the item (raw bitfield). */
  battlePockets: int(0, 31),
  holdEffect: z.strictObject({ id: byte, parameter: byte }),
  fling: z.strictObject({ effect: byte, power: byte }),
  /** Type 31 means "none". */
  naturalGift: z.strictObject({ power: byte, type: byte }),
  pluckEffect: byte,
  preventToss: z.boolean(),
  selectable: z.boolean(),
  /** Original field-use function id. */
  fieldUse: byte,
  /** Original battle-use function id. */
  battleUse: byte,
  /** Party-use kind and its 20 raw parameter bytes (40 lowercase hex characters). */
  partyUse: z.strictObject({ kind: byte, params: z.string().regex(/^[0-9a-f]{40}$/) }),
});
export const itemsFile = fileSchema("items", itemRecord);
export type ItemRecord = z.infer<typeof itemRecord>;
