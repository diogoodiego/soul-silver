import { toTicks } from "@soulsilver/shared/combat";
import { describe, expect, it } from "vitest";
import { MOVES, realAction } from "./combat-fixture";
import { startFight } from "./ai-fight";
import { px } from "./wild-fixture";

// Spec 019 US2: the AI plays by the player's rules: no move on cooldown, no move without a wind-up
// (block C: at least the quickest cast of a chain).

const minCast = toTicks(Math.min(...realAction().normalCastS));

describe("the AI in real combat (US2, SC-005)", () => {
  it("in 200 fights it never presses a move on cooldown and every move shows its cast first", () => {
    let uses = 0;
    for (let seed = 1; seed <= 200; seed++) {
      let lastCast: { startTick: number; readyTick: number } | undefined;
      let usedBefore = 0;
      startFight({
        seed,
        wild: { species: "rattata", level: 4, moves: [MOVES.tackle.id, MOVES.quickAttack.id, MOVES.growl.id] },
        starter: { species: "cyndaquil", level: 5, moves: [MOVES.tackle.id] },
        maxTicks: 20 * 30,
        watch(f, tick) {
          const c = f.combat.get(f.wild)!;
          if (c.used.count > usedBefore) {
            uses++;
            expect(lastCast, `seed ${seed} tick ${tick}: a move came out with no cast`).toBeDefined();
            expect(lastCast!.readyTick - lastCast!.startTick).toBeGreaterThanOrEqual(minCast);
            usedBefore = c.used.count;
            lastCast = undefined;
          }
          if (c.casting) lastCast = { startTick: c.casting.startTick, readyTick: c.casting.readyTick };
        },
      }).run();
    }
    expect(uses).toBeGreaterThan(200);
  });

  it("parries inside the parry window, as the reference bot does", () => {
    const parries = { wild: 0, starter: 0 };
    for (let seed = 1; seed <= 60; seed++) {
      startFight({
        seed,
        wild: { species: "rattata", level: 10, moves: [MOVES.tackle.id] },
        starter: { species: "cyndaquil", level: 10, moves: [MOVES.tackle.id] },
        maxTicks: 20 * 30,
        watch(f, _tick, hits) {
          for (const h of hits) if (h.kind === "parried") parries[h.target === f.wild ? "wild" : "starter"]++;
        },
      }).run();
    }
    expect(parries.wild).toBeGreaterThan(10);
    expect(parries.starter).toBeGreaterThan(10);
  });

  it("sees a leap coming from farther than the move itself reaches", () => {
    let dodges = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const f = startFight({
        seed,
        wild: { species: "rattata", level: 10, moves: [MOVES.tackle.id] },
        starter: { species: "cyndaquil", level: 10, moves: [MOVES.strength.id] },
        maxTicks: 20 * 20,
        watch(f) {
          const wild = f.world.get(f.wild)!;
          if (wild.data["dodge"] === true) dodges++;
          // Strength's arc reaches 28 px, its leap 48 more: the two stay 60 px apart, and it is charged again and again.
          const c = f.combat.get(f.starter)!;
          f.world.update({ ...wild, x: px(16), y: px(20) });
          f.world.update({ ...f.world.get(f.starter)!, x: px(16) - 60, y: px(20) });
          c.readyAt[2] = 0;
          c.hp = c.stats.hp;
          f.combat.get(f.wild)!.hp = f.combat.get(f.wild)!.stats.hp;
        },
      });
      const input = f.combat.input.bind(f.combat);
      f.combat.input = (id, i) => input(id, id === f.starter ? { move: { x: 0, y: 0 }, buttons: f.tick % 2 ? 1 << 2 : 0 } : i);
      f.run();
    }
    expect(dodges).toBeGreaterThan(0);
  });

  it("never presses a special while it cools down", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const f = startFight({ seed, wild: { species: "sentret", level: 3, moves: [MOVES.tackle.id, MOVES.growl.id] }, starter: { species: "cyndaquil", level: 5, moves: [MOVES.tackle.id] }, maxTicks: 20 * 20 });
      const drive = f.ai.drive.bind(f.ai);
      f.ai.drive = (id: number) => {
        const out = drive(id);
        const c = f.combat.get(id)!;
        for (const slot of [2, 3]) if (out && out.input.buttons & (1 << slot) && !c.casting) expect(f.tick, `seed ${seed} slot ${slot}`).toBeGreaterThanOrEqual(c.readyAt[slot]!);
        return out;
      };
      f.run();
    }
  });
});
