/** What the menu shows for one of the 3 slots (spec 012, data-model.md). */
export type SlotSummary =
  | { index: number; status: "empty" }
  | { index: number; status: "ok"; name: string; character: "male" | "female"; area: string; playTimeMs: number; savedAt: string; backupAvailable: boolean }
  | { index: number; status: "corrupt"; reason: string; backupAvailable: boolean }
  | { index: number; status: "unrecoverable"; reason: string };

export const SAVE_SLOTS = 3;

/** Reason of a SaveResult when the player cancelled a file dialog; not an error to show. */
export const CANCELLED = "cancelled";

export type SaveResult = { ok: true } | { ok: false; reason: string };
