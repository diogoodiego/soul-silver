// Block C (docs/roadmap/combate.md): normal moves (power below 80) chain without a cooldown and can be
// parried; special ones (power 80 and up, status, fixed or variable damage) have a cooldown and can only
// be dodged. Slots 0–1 hold normals, 2–3 specials; a slot with no move of its class stays empty.

export const SPECIAL_POWER = 80;

/** `power` is the original one: 0 for status moves, 1 for variable or calculated damage. */
export function isSpecial(move: { power: number }, fixedDamage = false): boolean {
  return fixedDamage || move.power <= 1 || move.power >= SPECIAL_POWER;
}

/** Indices into `moves` for slots 0–3; each class keeps its last two, the earlier ones are `extra`. */
export function slotIndices<T>(moves: readonly T[], special: (m: T) => boolean): { slots: (number | undefined)[]; extra: number[] } {
  const all = moves.map((_, i) => i);
  const normals = all.filter((i) => !special(moves[i]!));
  const specials = all.filter((i) => special(moves[i]!));
  const n = normals.slice(-2);
  const s = specials.slice(-2);
  const keep = [...n, ...s];
  return { slots: [n[0], n[1], s[0], s[1]], extra: all.filter((i) => !keep.includes(i)) };
}

/** Sorts a member's moves by class (PP Ups follow their move) and moves the extra ones to `forgottenMoves`; true when it changed. */
export function fitMoves(m: { moves: number[]; ppUps?: number[] | undefined; forgottenMoves?: number[] | undefined }, special: (move: number) => boolean): boolean {
  const { slots, extra } = slotIndices(m.moves, special);
  const order = slots.filter((i): i is number => i !== undefined);
  if (extra.length === 0 && order.every((i, k) => i === k)) return false;
  const ups = m.ppUps;
  if (extra.length > 0) m.forgottenMoves = [...new Set([...(m.forgottenMoves ?? []), ...extra.map((i) => m.moves[i]!)])];
  if (ups) m.ppUps = order.map((i) => ups[i] ?? 0);
  m.moves = order.map((i) => m.moves[i]!);
  return true;
}

/** Learning `move`: free when its class has room (and fewer than 4 are known); otherwise the same-class moves it may replace. */
export function learnChoice(moves: readonly number[], move: number, special: (move: number) => boolean): { free: boolean; replaceable: number[] } {
  const replaceable = moves.map((_, i) => i).filter((i) => special(moves[i]!) === special(move));
  return { free: replaceable.length < 2 && moves.length < 4, replaceable };
}
