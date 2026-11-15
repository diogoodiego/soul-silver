// The Route 34 Day Care (spec 029, item 029.1), as pret/pokeheartgold src/get_egg.c: up to two Pokémon,
// 1 experience per step, a withdraw cost of 100 plus 100 per level gained. Eggs are a later item.
import type { GrowthRateKey } from "../game-data/species.ts";
import { expForLevel, levelFor } from "../progression/experience.ts";
import type { PartyMember } from "../save/schema.ts";

/** A Pokémon left at the Day Care and the steps walked since (DaycareMon). */
export interface DaycareSlot {
  mon: PartyMember;
  steps: number;
}

export const DAYCARE_SLOTS = 2;
const MAX_LEVEL = 100;

/** Save_Daycare_GetState: 0 empty, 1 an egg waiting (never, until eggs exist), 2 one Pokémon, 3 two. */
export const daycareState = (d: readonly DaycareSlot[]): number => (d.length === 0 ? 0 : d.length + 1);

/** Save_Daycare_PutMonIn: the member leaves the party for the first free slot, with no steps yet. */
export function deposit(party: PartyMember[], slot: number, d: DaycareSlot[]): void {
  const mon = party[slot];
  if (!mon || d.length >= DAYCARE_SLOTS) throw new Error(`Não dá para deixar o membro ${slot} na Creche`);
  party.splice(slot, 1);
  d.push({ mon, steps: 0 });
}

/** HandleDaycareStep: one step for every Pokémon left. */
export function daycareStep(d: DaycareSlot[]): void {
  for (const s of d) s.steps++;
}

/** The experience with the steps added; a Pokémon at level 100 gains none. */
function grownExperience({ mon, steps }: DaycareSlot, rate: GrowthRateKey): number {
  return mon.level >= MAX_LEVEL ? mon.experience : Math.min(mon.experience + steps, expForLevel(rate, MAX_LEVEL));
}

/** GetDaycareUpdatedLevel: the level it would have if taken back now. */
export const grownLevel = (s: DaycareSlot, rate: GrowthRateKey): number => Math.max(s.mon.level, levelFor(rate, grownExperience(s, rate)));

/** DaycareMon_CalcLevelGrowth. */
export const levelsGained = (s: DaycareSlot, rate: GrowthRateKey): number => grownLevel(s, rate) - s.mon.level;

/** Save_Daycare_BufferMonNickAndRetrievalPrice. */
export const withdrawCost = (gained: number): number => (gained + 1) * 100;

export interface DaycareGrowth {
  rate: GrowthRateKey;
  levelUp: readonly { level: number; move: number }[];
}

/**
 * Save_Daycare_RetrieveMon: the steps become experience; each level reached learns its moves
 * (Daycare_LearnLevelUpMoves), dropping the first move when four are known; the stats follow the
 * new level with the damage kept. The second slot moves up (Save_Daycare_Compaction).
 */
export function retrieve(d: DaycareSlot[], index: number, growth: DaycareGrowth, hpMax: (m: PartyMember) => number): PartyMember {
  const slot = d[index];
  if (!slot) throw new Error(`A Creche não tem Pokémon no lugar ${index}`);
  d.splice(index, 1);
  const { mon } = slot;
  if (mon.level >= MAX_LEVEL) return mon;
  const before = hpMax(mon);
  const to = grownLevel(slot, growth.rate);
  const moves = [...mon.moves];
  for (let level = mon.level + 1; level <= to; level++) {
    for (const { move } of growth.levelUp.filter((l) => l.level === level)) {
      if (moves.includes(move)) continue;
      if (moves.length === 4) moves.shift();
      moves.push(move);
    }
  }
  const grown = { ...mon, level: to, experience: grownExperience(slot, growth.rate), moves };
  // CalcMonLevelAndStats: a fainted Pokémon stays fainted.
  grown.hp = mon.hp === 0 ? 0 : Math.max(1, mon.hp + hpMax(grown) - before);
  return grown;
}
export * from "./breeding.ts";
export * from "./hatch.ts";
