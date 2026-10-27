import type { Rng } from "../game/rng.ts";
import type { SpeciesRecord } from "../game-data/species.ts";
import type { PartyMember } from "../save/schema.ts";
import { wildMoves } from "../wild/moves.ts";
import { expForLevel } from "./experience.ts";
import { memberStats } from "./member.ts";

// The starter chosen on a new game (spec 017): the three Johto starters at level 5, as Professor
// Elm gives them, until the lab event exists (spec 19).

export const STARTERS = [152, 155, 158] as const;
export const STARTER_LEVEL = 5;

/** Also any Pokémon a script gives (spec 020), at its level. */
export function starterMember(species: Pick<SpeciesRecord, "id" | "baseStats" | "growthRate" | "baseFriendship">, levelUp: readonly { level: number; move: number }[], rng: Rng, level: number = STARTER_LEVEL): PartyMember {
  const iv = () => rng.nextInt(32);
  const m = {
    species: species.id,
    level,
    moves: wildMoves(levelUp, level),
    hp: 0,
    friendship: species.baseFriendship,
    experience: expForLevel(species.growthRate, level),
    ivs: { hp: iv(), attack: iv(), defense: iv(), speed: iv(), specialAttack: iv(), specialDefense: iv() },
    evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 },
    nature: rng.nextInt(25),
  };
  return { ...m, hp: memberStats(species.baseStats, m).hp };
}
