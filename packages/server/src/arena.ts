import { memberStats, expForLevel } from "@soulsilver/shared/progression";
import type { ArenaCombatant, WorldMap } from "@soulsilver/shared/game";
import type { TrainerRecord } from "@soulsilver/shared/events";
import type { Direction } from "@soulsilver/shared/maps";
import type { PartyMember } from "@soulsilver/shared/save";
import type { CombatData } from "./combat-loader";
import type { ProgressionData } from "./progression";

// The dev arena (spec 013, US6; trainer and teams in 2026-11): the player's trainer and team on an open field,
// against an NPC trainer's battle or wild Pokémon, fighting with the AI or standing still as targets.

export const ARENA_AREA = "arena";
const WIDTH = 24;
const HEIGHT = 16;
const center = (tile: number) => tile * 16 + 8;

/** An open field: no walls, no warps, no wild table. */
export const ARENA_MAP: WorldMap = {
  id: ARENA_AREA,
  levels: [{ width: WIDTH, height: HEIGHT, tiles: Array.from({ length: WIDTH * HEIGHT }, () => ({ category: "free" as const, raw: 0 })) }],
  warps: [],
  neighbors: [],
  widthPx: WIDTH * 16,
  heightPx: HEIGHT * 16,
};

/** The player stands at the field's west side, facing east, where the foes are. */
export const ARENA_SPAWN = { area: ARENA_AREA, x: center(4), y: center(8), level: 0, facing: "east" as Direction };

/** Where the n-th wild foe stands: east of the player, in columns of three. */
export const foeSpot = (n: number) => ({ x: center(12 + Math.floor(n / 3) * 3), y: center(6 + (n % 3) * 2) });

/** A party member at full HP from an arena entry; throws on a species or move the extraction lacks. */
export function arenaMember(c: ArenaCombatant, combat: CombatData, progression?: ProgressionData): PartyMember {
  const species = combat.species(c.species);
  if (!species) throw new Error(`espécie ${c.species} não existe na extração`);
  const missing = c.moves.find((m) => !combat.move(m));
  if (missing !== undefined) throw new Error(`golpe ${missing} não existe na extração`);
  const rate = progression?.species(c.species)?.growthRate;
  const perfect = { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 };
  const none = { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 };
  const member: PartyMember = { species: c.species, level: c.level, moves: [...c.moves], hp: 0, friendship: 70, experience: rate ? expForLevel(rate, c.level) : 0, ivs: perfect, evs: none, nature: 0 };
  return { ...member, hp: memberStats(species.baseStats, member).hp };
}

/** A trainer team member from an arena entry: its moves as given, the original's top difficulty (IVs 31). */
export const trainerMember = (c: ArenaCombatant): TrainerRecord["team"][number] => ({
  difficulty: 255,
  genderOverride: 0,
  abilityOverride: 0,
  level: c.level,
  species: c.species,
  form: 0,
  item: null,
  moves: [...c.moves, 0, 0, 0].slice(0, 4),
  capsule: 0,
});
