import type { Rng } from "../game/rng.ts";
import type { Save } from "../save/schema.ts";

// Item 031.2: the roaming legendaries (CreateRoamer, pokeheartgold's roamer.c). Raikou (0) and Entei (1) roam
// Johto once the Burned Tower's scene sends them off; each player has their own, kept in the save.

export type Roamer = NonNullable<Save["roamers"]>[number];

/** By CreateRoamer's argument; 2 and 3 (Latias, Latios) roam Kanto after the League. */
export const ROAMER_SPECIES: Readonly<Record<number, number>> = { 0: 243, 1: 244 };
export const ROAMER_LEVEL = 40;
/** Johto's land routes, by map id: Routes 29 to 39 and 42 to 46. */
export const ROAMER_ROUTES: readonly string[] = ["33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"];
/** VAR_ROAMER_STATE + id: 2 when knocked out, which brings it back after the Hall of Fame (scr_seq 825). */
export const ROAMER_STATE_VAR = 0x4045;
export const ROAMER_KNOCKED_OUT = 2;

const elsewhere = (area: string | undefined, rng: Rng) => {
  const others = ROAMER_ROUTES.filter((a) => a !== area);
  return others[rng.nextInt(others.length)]!;
};

/** Starts roamer `id` afresh on a random route; a Kanto one is left out. */
export function createRoamer(list: Roamer[], id: number, rng: Rng): void {
  // shortcut: Latias and Latios (2, 3) never roam, as Kanto's routes are Marco 5; add theirs when it comes.
  if (ROAMER_SPECIES[id] === undefined) return;
  const i = list.findIndex((r) => r.id === id);
  if (i >= 0) list.splice(i, 1);
  list.push({ id, area: elsewhere(undefined, rng) });
}

/** A map change: every roamer jumps to another route. */
// shortcut: always a random jump, as Fly makes them in the original; the step to a neighbouring route needs a route graph.
export function roam(list: Roamer[], rng: Rng): void {
  for (const r of list) r.area = elsewhere(r.area, rng);
}
