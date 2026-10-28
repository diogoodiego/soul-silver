import type { TrainerProfile } from "./schemas.ts";

// The trainer AI's decision points (spec 022, research R6): pure, so the server only feeds them
// what the trainer can know and carries out the answer.

export interface TeamView {
  types: readonly number[];
  hp: number;
  hpMax: number;
}

export interface SwitchInput {
  team: readonly TeamView[];
  active: number;
  /** Types of the moves the foe in front has shown or holds. */
  foeMoveTypes: readonly number[];
  effectiveness: (moveType: number, types: readonly number[]) => number;
  profile: TrainerProfile;
  nowS: number;
  lastSwitchS: number | undefined;
}

/** How hard the foe's best move type hits these types; 1 when it has none. */
const threat = (i: SwitchInput, types: readonly number[]) => (i.foeMoveTypes.length === 0 ? 1 : Math.max(...i.foeMoveTypes.map((t) => i.effectiveness(t, types))));

/** The team index to switch to, or undefined to stay. */
export function chooseSwitch(i: SwitchInput): number | undefined {
  const rules = i.profile.switch;
  const me = i.team[i.active];
  if (!rules.enabled || !me || me.hp === 0) return undefined;
  if (i.lastSwitchS !== undefined && i.nowS - i.lastSwitchS < rules.cooldownS) return undefined;
  const mine = threat(i, me.types);
  const disadvantage = mine >= rules.typeThreshold;
  const low = me.hp / me.hpMax < rules.hpThreshold;
  if (!disadvantage && !low) return undefined;
  let best: number | undefined;
  let bestThreat = Infinity;
  let bestHp = -1;
  i.team.forEach((m, index) => {
    if (index === i.active || m.hp === 0) return;
    const t = threat(i, m.types);
    // Out of a disadvantage only to something safer; out of low HP to something no worse.
    if (disadvantage ? t >= mine : t > mine) return;
    const hp = m.hp / m.hpMax;
    if (t < bestThreat || (t === bestThreat && hp > bestHp)) [best, bestThreat, bestHp] = [index, t, hp];
  });
  return best;
}

export interface ItemInput {
  hp: number;
  hpMax: number;
  /** Items the trainer still has, in the original order. */
  items: readonly number[];
  /** HP an item restores, or undefined when it is not a healing item. */
  heals: (item: number) => number | "full" | undefined;
  profile: TrainerProfile;
}

/** The item to use on the active Pokémon, or undefined. */
export function chooseItem(i: ItemInput): number | undefined {
  if (!i.profile.item.enabled || i.hp === 0 || i.hp / i.hpMax >= i.profile.item.hpThreshold) return undefined;
  return i.items.find((item) => i.heals(item) !== undefined);
}
