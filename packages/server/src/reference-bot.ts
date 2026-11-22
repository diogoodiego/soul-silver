import { reachPx, type MoveView } from "@soulsilver/shared/ai";
import { BUTTON, type Rng } from "@soulsilver/shared/game";
import type { Combatant, CombatInput } from "./combat";

// The spec 019 reference bot, shared by the headless fights in the server tests and the golden path (spec 024).

export interface BotSide {
  x: number;
  y: number;
  c: Combatant;
}

/** Ticks before a foe's cast leaves when the bot reacts: inside both the dodge's and the parry's reach. */
const REACT_TICKS = 6;

/**
 * Closes in, uses its strongest ready move (specials first, then normals in a chain), and answers half the casts it
 * sees: a special by dodging, a normal by dodging or parrying (block C).
 */
export function createReferenceBot(rng: Rng) {
  let answeredCast = -1;
  return (me: BotSide, foe: BotSide, tick: number): Required<Pick<CombatInput, "move" | "buttons" | "aim">> => {
    const d = Math.hypot(foe.x - me.x, foe.y - me.y) || 1;
    const dir = { x: (foe.x - me.x) / d, y: (foe.y - me.y) / d };
    let move = d > 20 ? dir : { x: 0, y: 0 };
    let buttons = 0;
    const cast = foe.c.casting;
    if (cast && cast.startTick !== answeredCast && cast.readyTick - tick <= REACT_TICKS) {
      answeredCast = cast.startTick;
      if (rng.nextFloat() < 0.5) {
        const special = foe.c.moves[cast.slot]?.special ?? true;
        if (special || rng.nextFloat() < 0.5) {
          buttons |= BUTTON.dash;
          move = { x: -dir.y, y: dir.x };
        } else buttons |= BUTTON.guard;
        return { move, buttons, aim: dir };
      }
    }
    const ready = me.c.moves.flatMap((m, slot) => (m && tick >= (me.c.readyAt[slot] ?? 0) ? [{ m, slot }] : []));
    const best = ready.sort((a, b) => Number(b.m.special) - Number(a.m.special) || b.m.power - a.m.power)[0];
    if (best && !me.c.casting && tick % 2 === 0 && d <= reachPx(best.m as unknown as MoveView) + 8) buttons |= 1 << best.slot;
    return { move, buttons, aim: dir };
  };
}
