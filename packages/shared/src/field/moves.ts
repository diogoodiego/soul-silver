import type { FieldMoveRule, FieldMovesRules, FieldObstacle } from "./schemas.ts";

type Member = { moves: readonly number[] };

/** Who uses a field move: the companion when it knows it (FR-004), else the first member who does, as GetPartySlotWithMove. */
export function pickUser(party: readonly Member[], move: number, companion?: number): number | undefined {
  if (companion !== undefined && party[companion]?.moves.includes(move)) return companion;
  const i = party.findIndex((m) => m.moves.includes(move));
  return i === -1 ? undefined : i;
}

export type FieldMoveCheck = { ok: true; move: FieldMoveRule; user: number } | { ok: false; reason: "move" | "badge" | "notHere" };

/** Whether the party may use this move; the move is checked before the badge, as the original scripts do. */
function check(move: FieldMoveRule | undefined, badgeSet: number, party: readonly Member[], companion?: number): FieldMoveCheck {
  if (!move) return { ok: false, reason: "notHere" };
  const user = pickUser(party, move.move, companion);
  if (user === undefined) return { ok: false, reason: "move" };
  if (move.badge !== undefined && (badgeSet & (1 << move.badge)) === 0) return { ok: false, reason: "badge" };
  return { ok: true, move, user };
}

/** Whether the party clears this obstacle. */
export function canUseFieldMove(rules: FieldMovesRules, badgeSet: number, party: readonly Member[], obstacle: FieldObstacle, companion?: number): FieldMoveCheck {
  return check(obstacle === "none" ? undefined : rules.moves.find((m) => m.obstacle === obstacle), badgeSet, party, companion);
}

/** The same for a move used from the menu by its name (Fly, Flash, Dig, Teleport). */
export function canUseNamedMove(rules: FieldMovesRules, badgeSet: number, party: readonly Member[], name: string, companion?: number): FieldMoveCheck {
  return check(rules.moves.find((m) => m.name === name), badgeSet, party, companion);
}
