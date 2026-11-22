import { describe, expect, it } from "vitest";
import { combatSetup, MOVES } from "./combat-fixture";

describe("combat performance", () => {
  it("resolves 8 combatants with ~32 moves in flight in under 1 ms per tick on average", () => {
    const t = combatSetup();
    const ids = Array.from({ length: 8 }, (_, i) =>
      t.spawn(i % 2 ? "sentret" : "cyndaquil", [MOVES.ember.id, MOVES.toxicSpikes.id, MOVES.tackle.id], { x: (i % 4) * 60, y: Math.floor(i / 4) * 60 }, i % 2 ? "wild" : 1, 60),
    );
    // Keep the projectiles flying a long way so many stay active at once.
    Object.assign(t.data.move(MOVES.ember.id)!, { rangePx: 2000, speedPx: 40 });
    let peak = 0;
    const started = performance.now();
    const TICKS = 600;
    for (let i = 0; i < TICKS; i++) {
      for (const id of ids) {
        if (i % 2 === 0) t.press(id, 1 + (i % 4 === 0 ? 0 : 1), { x: Math.cos(i + id), y: Math.sin(i + id) });
        else t.walk(id, { x: Math.cos(i), y: Math.sin(i) });
      }
      t.step();
      peak = Math.max(peak, t.world.all().filter((e) => e.kind === "projectile").length);
    }
    const avg = (performance.now() - started) / TICKS;
    expect(peak).toBeGreaterThanOrEqual(32);
    expect(avg).toBeLessThan(1);
  });
});
