import { slotIndices } from "../combat/classes.ts";

/** Tackle: what a Pokémon with no level-up moves knows, so it can still fight. */
const FALLBACK_MOVE = 33;

/**
 * The moves a wild Pokémon knows, as the original builds them: learnt in order up to its level, keeping the last four
 * (research R6). Block C: with `special`, the last two of each class instead, normals first.
 */
export function wildMoves(levelUp: readonly { level: number; move: number }[], level: number, special?: (move: number) => boolean): number[] {
  const known: number[] = [];
  for (const entry of levelUp) {
    if (entry.level > level || known.includes(entry.move)) continue;
    known.push(entry.move);
    if (!special && known.length > 4) known.shift();
  }
  if (known.length === 0) return [FALLBACK_MOVE];
  if (!special) return known;
  return slotIndices(known, special).slots.filter((i): i is number => i !== undefined).map((i) => known[i]!);
}
