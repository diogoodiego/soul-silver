import { toTicks } from "@soulsilver/shared/combat";
import { describe, expect, it } from "vitest";
import { BUNDLED_AI_CONTENT, buildAiData } from "../src/ai-loader";
import { MOVES } from "./combat-fixture";
import { startFight } from "./ai-fight";

// Spec 019 US2: the AI plays by the player's rules: no move on cooldown, no move without a wind-up.

const minCast = toTicks(buildAiData(BUNDLED_AI_CONTENT).tuning.cast.aiMinCastS);

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

  it("never presses a slot whose cooldown is running", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const f = startFight({ seed, wild: { species: "sentret", level: 3, moves: [MOVES.tackle.id, MOVES.scratch.id] }, starter: { species: "cyndaquil", level: 5, moves: [MOVES.tackle.id] }, maxTicks: 20 * 20 });
      const drive = f.ai.drive.bind(f.ai);
      f.ai.drive = (id: number) => {
        const out = drive(id);
        const c = f.combat.get(id)!;
        for (let slot = 0; slot < 4; slot++) if (out && out.input.buttons & (1 << slot)) expect(f.tick, `seed ${seed} slot ${slot}`).toBeGreaterThanOrEqual(c.readyAt[slot]!);
        return out;
      };
      f.run();
    }
  });
});
