import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRng } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { computeCoverage, COVERAGE_FILE } from "../../../scripts/combat-coverage";
import { createCombat } from "../src/combat";
import { BUNDLED_COMBAT_CONTENT, buildCombatData } from "../src/combat-loader";
import { createWorld } from "../src/world";
import { readContent } from "./combat-fixture";

const STAGES = join(import.meta.dirname, "..", "..", "..", "assets", "stages");
const hasExtraction = existsSync(join(STAGES, "data-moves", "json", "moves.json"));
const coverage = JSON.parse(readFileSync(COVERAGE_FILE, "utf8")) as { moves: number[] };

describe("move coverage (SC-002)", () => {
  it("every move of the playable slice has its own mapping", () => {
    const mapped = new Set((readContent().moves as { records: { id: number }[] }).records.map((r) => r.id));
    expect(coverage.moves.length).toBeGreaterThan(0);
    expect(coverage.moves.filter((id) => !mapped.has(id))).toEqual([]);
  });

  it.skipIf(!hasExtraction)("coverage.json is up to date with the extraction", () => {
    expect(computeCoverage(STAGES)).toEqual(coverage.moves);
  });

  it.skipIf(!hasExtraction)("loads against the real extraction, and every move in it can be used (SC-004)", () => {
    const read = <T>(stage: string, file: string) => (JSON.parse(readFileSync(join(STAGES, stage, "json", file), "utf8")) as { records: T }).records;
    const moves = read<{ id: number }[]>("data-moves", "moves.json");
    const data = buildCombatData(BUNDLED_COMBAT_CONTENT, { moves: read("data-moves", "moves.json"), species: read("data-species", "species.json"), typeChart: read("data-tables", "type-chart.json") });
    const world = createWorld();
    const combat = createCombat({ data, rng: createRng(1), lookup: () => undefined });
    let tick = 0;
    for (const { id } of moves) {
      if (id === 0) continue;
      const a = world.add({ kind: "pokemon", area: "x", x: 0, y: 0, level: 0, facing: "east", data: {} }).id;
      const b = world.add({ kind: "pokemon", area: "x", x: 20, y: 0, level: 0, facing: "west", data: {} }).id;
      combat.spawn(world, a, { species: 155, level: 30, moves: [id] }, 1);
      combat.spawn(world, b, { species: 152, level: 30, moves: [] }, "wild");
      combat.input(a, { move: { x: 0, y: 0 }, buttons: 1, aim: { x: 1, y: 0 } });
      for (let i = 0; i < 40; i++) combat.step(++tick, world);
      for (const e of [a, b]) {
        combat.remove(world, e);
        world.remove(e);
      }
    }
    for (const id of coverage.moves) expect(data.move(id)!.archetype.startsWith("generic-")).toBe(false);
  });
});
