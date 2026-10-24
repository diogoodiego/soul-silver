// How the game turns the ids stored in events into script files and trainers.
// See specs/008-events-scripts-encounters/research.md R0 (script_manager.c).
import { NO_SCRIPT, SCRIPT_BANKS, TRAINER_SCRIPTS } from "./layout.ts";

export interface ScriptTarget {
  id: number;
  file: number;
  entry: number;
  messageBank: number;
}

/** The script file and message bank of the map an event belongs to. */
export interface MapScripts {
  scriptFile: number | null;
  messageBank: number | null;
}

/** Ids 0 and 0xFFFF are no script; a range from the shared table goes to its file; any other id is the map's own, entry id - 1. */
export function resolveScript(id: number, map: MapScripts): ScriptTarget | null {
  if (id === 0 || id === NO_SCRIPT) return null;
  const bank = SCRIPT_BANKS.find((b) => id >= b.lo);
  if (bank) return { id, file: bank.file, entry: id - bank.lo, messageBank: bank.messageBank };
  if (map.scriptFile === null || map.messageBank === null) return null;
  return { id, file: map.scriptFile, entry: id - 1, messageBank: map.messageBank };
}

/** Trainer scripts are ids 3000 to 4999 and 5000 to 6999; the trainer is the id minus the base plus 1. */
export function trainerOfScript(id: number): number | null {
  const range = TRAINER_SCRIPTS.find((r) => id >= r.lo && id <= r.hi);
  return range ? id - range.lo + 1 : null;
}
