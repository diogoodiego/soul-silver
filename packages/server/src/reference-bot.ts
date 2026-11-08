import { reachPx, type MoveView } from "@soulsilver/shared/ai";
import { BUTTON, type Rng } from "@soulsilver/shared/game";
import type { Combatant, CombatInput } from "./combat";

// The spec 019 reference bot, shared by the headless fights in the server tests and the golden path (spec 024).

export interface BotSide {
  x: number;
  y: number;
  c: Combatant;
}

/** Closes in, uses its strongest ready move, sidesteps half the casts it sees. */
export function createReferenceBot(rng: Rng) {
  let dodgedCast = -1;
  return (me: BotSide, foe: BotSide, tick: number): Required<Pick<CombatInput, "move" | "buttons" | "aim">> => {
    const d = Math.hypot(foe.x - me.x, foe.y - me.y) || 1;
    const dir = { x: (foe.x - me.x) / d, y: (foe.y - me.y) / d };
    let move = d > 20 ? dir : { x: 0, y: 0 };
    let buttons = 0;
    if (foe.c.casting && foe.c.casting.startTick !== dodgedCast) {
      dodgedCast = foe.c.casting.startTick;
      if (rng.nextFloat() < 0.5) {
        buttons |= BUTTON.dash;
        move = { x: -dir.y, y: dir.x };
      }
    }
    const ready = me.c.gauge >= 1 ? me.c.moves.map((m, slot) => ({ m, slot })) : [];
    const best = ready.sort((a, b) => b.m.power - a.m.power)[0];
    if (best && !me.c.casting && tick % 2 === 0 && d <= reachPx(best.m as unknown as MoveView) + 8) buttons |= 1 << best.slot;
    return { move, buttons, aim: dir };
  };
}
