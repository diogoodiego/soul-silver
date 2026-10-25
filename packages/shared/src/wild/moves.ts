/** Tackle: what a Pokémon with no level-up moves knows, so it can still fight. */
const FALLBACK_MOVE = 33;

/** The moves a wild Pokémon knows, as the original builds them: learnt in order up to its level, keeping the last four (research R6). */
export function wildMoves(levelUp: readonly { level: number; move: number }[], level: number): number[] {
  const known: number[] = [];
  for (const entry of levelUp) {
    if (entry.level > level || known.includes(entry.move)) continue;
    known.push(entry.move);
    if (known.length > 4) known.shift();
  }
  return known.length > 0 ? known : [FALLBACK_MOVE];
}
