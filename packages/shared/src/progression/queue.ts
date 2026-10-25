import type { EvolutionRecord, LearnsetRecord } from "../game-data/index.ts";
import type { ProgressionItem } from "../save/schema.ts";

// What a level gain puts on the progression queue (spec 016, research R5): each level, then its
// moves, then one level evolution after the last level.

export interface LevelUpInput {
  member: number;
  from: number;
  to: number;
  /** Moves known now; those are not offered again. */
  moves: number[];
  learnset: LearnsetRecord["levelUp"];
  evolutions: Pick<EvolutionRecord["evolutions"][number], "method" | "condition" | "into">[];
}

export function levelUpItems({ member, from, to, moves, learnset, evolutions }: LevelUpInput): ProgressionItem[] {
  const items: ProgressionItem[] = [];
  const known = new Set(moves);
  for (let level = from + 1; level <= to; level++) {
    items.push({ kind: "level-up", member, level });
    for (const l of learnset) {
      if (l.level !== level || known.has(l.move)) continue;
      known.add(l.move);
      items.push({ kind: "learn", member, move: l.move });
    }
  }
  // Other methods (stone, trade, friendship, time) belong to later specs.
  const evolution = to > from ? evolutions.find((e) => e.method === "level" && e.condition.kind === "level" && e.condition.level <= to) : undefined;
  if (evolution) items.push({ kind: "evolve", member, into: evolution.into });
  return items;
}
