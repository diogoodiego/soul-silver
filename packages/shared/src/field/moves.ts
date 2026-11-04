import type { FieldMoveRule, FieldMovesRules, FieldObstacle } from "./schemas.ts";

type Member = { moves: readonly number[] };

/** Who uses a field move: the companion when it knows it (FR-004), else the first member who does, as GetPartySlotWithMove. */
export function pickUser(party: readonly Member[], move: number, companion?: number): number | undefined {
  if (companion !== undefined && party[companion]?.moves.includes(move)) return companion;
  const i = party.findIndex((m) => m.moves.includes(move));
  return i === -1 ? undefined : i;
}

export type FieldMoveCheck = { ok: true; move: FieldMoveRule; user: number } | { ok: false; reason: "move" | "badge" | "notHere" };

/** Whether the party clears this obstacle; the move is checked before the badge, as the original scripts do. */
export function canUseFieldMove(rules: FieldMovesRules, badgeSet: number, party: readonly Member[], obstacle: FieldObstacle, companion?: number): FieldMoveCheck {
  const move = obstacle === "none" ? undefined : rules.moves.find((m) => m.obstacle === obstacle);
  if (!move) return { ok: false, reason: "notHere" };
  const user = pickUser(party, move.move, companion);
  if (user === undefined) return { ok: false, reason: "move" };
  if (move.badge !== undefined && (badgeSet & (1 << move.badge)) === 0) return { ok: false, reason: "badge" };
  return { ok: true, move, user };
}
