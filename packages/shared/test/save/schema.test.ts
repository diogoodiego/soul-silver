import { describe, expect, it } from "vitest";
import { saveSchema } from "../../src/save/schema.ts";

const valid = {
  schemaVersion: 1,
  name: "Gold",
  character: "male",
  area: "60",
  x: 120,
  y: 88,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
};

describe("saveSchema", () => {
  it("accepts the documented example", () => {
    expect(saveSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    { name: "" },
    { name: "   " },
    { name: "x".repeat(17) },
    { character: "other" },
    { facing: "northeast" },
    { x: Number.NaN },
    { y: Infinity },
    { playTimeMs: -1 },
    { playTimeMs: 1.5 },
    { rev: -1 },
    { savedAt: "yesterday" },
    { schemaVersion: 0 },
    { extra: true },
  ])("rejects %o", (patch) => {
    expect(saveSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
