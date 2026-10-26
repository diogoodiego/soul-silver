import { createRng, type WorldMap } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createAi } from "../src/ai";
import { buildAiData, BUNDLED_AI_CONTENT } from "../src/ai-loader";
import { createCombat } from "../src/combat";
import { createWorld } from "../src/world";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { grassMap, px } from "./wild-fixture";

// Spec 019 FR-031, FR-032, SC-007: sleeping AIs cost nothing, the rest stay within the tick budget.

const MAP: WorldMap = grassMap("field", () => true);
const lookup = (id: string) => (id === "field" ? MAP : undefined);
const data = buildAiData(BUNDLED_AI_CONTENT);

function field(wilds: number, players: number, playerAt = (i: number) => ({ x: px(10 + i * 10), y: px(20) })) {
  const world = createWorld();
  const cd = combatData();
  const rng = createRng(1);
  const combat = createCombat({ data: cd, rng, lookup });
  const ai = createAi({ data, combat, combatData: cd, world, lookup, rng });
  for (let i = 0; i < players; i++) {
    const at = playerAt(i);
    world.add({ kind: "player", area: "field", ...at, level: 0, facing: "east", data: {} });
    const mon = world.add({ kind: "pokemon", area: "field", x: at.x + 16, y: at.y, level: 0, facing: "east", data: {} }).id;
    combat.spawn(world, mon, { species: SPECIES.cyndaquil.id, level: 10, moves: [MOVES.tackle.id, MOVES.ember.id] }, i + 1);
  }
  const ids: number[] = [];
  for (let i = 0; i < wilds; i++) {
    const home = { x: px(5 + (i % 10) * 5), y: px(10 + Math.floor(i / 10) * 8) };
    const id = world.add({ kind: "pokemon", area: "field", ...home, level: 0, facing: "south", data: {} }).id;
    combat.spawn(world, id, { species: SPECIES.rattata.id, level: 5, moves: [MOVES.tackle.id, MOVES.quickAttack.id] }, "wild");
    ai.add(id, { home, level: 5, temperament: "aggressive", leashPx: 160 });
    ids.push(id);
  }
  let tick = 0;
  let hits = combat.step(0, world);
  let aiMs = 0;
  const step = () => {
    tick++;
    const t0 = performance.now();
    ai.prepare(tick, hits);
    for (const id of ids) ai.drive(id);
    aiMs += performance.now() - t0;
    hits = combat.step(tick, world);
  };
  return { ai, ids, step, world, aiMs: () => aiMs };
}

describe("AI cost (FR-031, FR-032, SC-007)", () => {
  it("an AI far from every trainer is dormant: no state change, no decision", () => {
    const f = field(3, 1, () => ({ x: px(55), y: px(38) }));
    // Homes at x 5..15 tiles, y 10: the trainer is more than dormantTiles away from them.
    const far = f.ids.filter((id) => Math.hypot(f.world.get(id)!.x - px(55), f.world.get(id)!.y - px(38)) > data.tuning.performance.dormantTiles * 16);
    expect(far.length).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) f.step();
    for (const id of far) {
      expect(f.ai.get(id)!.state).toBe("idle");
      expect(f.ai.get(id)!.nextPerception).toBeLessThan(4);
    }
    expect(f.ai.decisions().filter((d) => far.includes(d.entityId))).toEqual([]);
  });

  it("spreads perception over different ticks", () => {
    const f = field(30, 4);
    expect(new Set(f.ids.map((id) => f.ai.get(id)!.nextPerception % data.tuning.perception.everyTicks)).size).toBe(data.tuning.perception.everyTicks);
  });

  it("30 active AIs and 4 players stay within the tick budget", () => {
    const f = field(30, 4);
    for (let i = 0; i < 40; i++) f.step();
    const before = f.aiMs();
    const ticks = 400;
    for (let i = 0; i < ticks; i++) f.step();

    expect((f.aiMs() - before) / ticks).toBeLessThan(data.tuning.performance.budgetMsPerTick);
  });
});
