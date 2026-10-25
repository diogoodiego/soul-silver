import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveness } from "../../src/combat/types.ts";
import { GEN4_CHART, T } from "./fixtures/type-chart-gen4.ts";

const EXTRACTED = join(import.meta.dirname, "../../../../assets/stages/data-tables/json/type-chart.json");

describe("effectiveness", () => {
  it("matches every cell of the Gen 4 chart for single types", () => {
    for (const row of GEN4_CHART) {
      row.against.forEach((tenths, defender) => {
        expect(effectiveness(GEN4_CHART, row.id, [defender])).toBe(tenths / 10);
      });
    }
  });

  it("multiplies both types of a dual-type defender", () => {
    expect(effectiveness(GEN4_CHART, T.ice, [T.grass, T.flying])).toBe(4);
    expect(effectiveness(GEN4_CHART, T.fire, [T.water, T.rock])).toBe(0.25);
    expect(effectiveness(GEN4_CHART, T.electric, [T.water, T.ground])).toBe(0);
    expect(effectiveness(GEN4_CHART, T.fire, [T.grass, T.water])).toBe(1);
  });

  it("counts a repeated type once", () => {
    expect(effectiveness(GEN4_CHART, T.fire, [T.grass, T.grass])).toBe(2);
  });

  it.skipIf(!existsSync(EXTRACTED))("the extracted chart is the Gen 4 chart", () => {
    const extracted = JSON.parse(readFileSync(EXTRACTED, "utf8")) as { records: typeof GEN4_CHART };
    expect(extracted.records).toEqual(GEN4_CHART);
  });
});
