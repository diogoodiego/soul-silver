// How the game turns the ids stored in events into script files and trainers.
// See specs/008-events-scripts-encounters/research.md R0 (script_manager.c). Shared since spec 020: the server resolves CallStd and RunScript ids.

/** The script id ranges the game resolves to shared script files, highest first; the first match wins. */
export const SCRIPT_BANKS: readonly { lo: number; file: number; messageBank: number }[] = [
  { lo: 10490, file: 263, messageBank: 433 },
  { lo: 10450, file: 264, messageBank: 19 },
  { lo: 10440, file: 2, messageBank: 748 },
  { lo: 10400, file: 151, messageBank: 246 },
  { lo: 10350, file: 952, messageBank: 726 },
  { lo: 10300, file: 734, messageBank: 444 },
  { lo: 10200, file: 144, messageBank: 209 },
  { lo: 10150, file: 955, messageBank: 732 },
  { lo: 10100, file: 954, messageBank: 733 },
  { lo: 10000, file: 146, messageBank: 211 },
  { lo: 9950, file: 148, messageBank: 666 },
  { lo: 9900, file: 136, messageBank: 40 },
  { lo: 9850, file: 167, messageBank: 312 },
  { lo: 9800, file: 166, messageBank: 43 },
  { lo: 9700, file: 163, messageBank: 266 },
  { lo: 9600, file: 149, messageBank: 40 },
  { lo: 9500, file: 265, messageBank: 439 },
  { lo: 9300, file: 143, messageBank: 204 },
  { lo: 9200, file: 164, messageBank: 267 },
  { lo: 9100, file: 0, messageBank: 14 },
  { lo: 9000, file: 4, messageBank: 46 },
  { lo: 8900, file: 165, messageBank: 268 },
  { lo: 8800, file: 262, messageBank: 427 },
  { lo: 8000, file: 145, messageBank: 210 },
  { lo: 7000, file: 141, messageBank: 199 },
  { lo: 5000, file: 953, messageBank: 40 },
  { lo: 3000, file: 953, messageBank: 40 },
  { lo: 2800, file: 150, messageBank: 23 },
  { lo: 2500, file: 1, messageBank: 20 },
  { lo: 2000, file: 3, messageBank: 40 },
];

/** Script ids 3000 to 4999 and 5000 to 6999 are trainer scripts; the id minus the base is trainer - 1. */
export const TRAINER_SCRIPTS = [
  { lo: 3000, hi: 4999 },
  { lo: 5000, hi: 6999 },
] as const;

/** Script arguments from this value up name a variable, not a value (vars.h: VAR_BASE). */
export const VAR_BASE = 0x4000;

/** Script id that means no script. */
export const NO_SCRIPT = 0xffff;

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
