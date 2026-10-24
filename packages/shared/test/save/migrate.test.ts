import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { saveSchema } from "../../src/save/schema.ts";

const v1 = {
  schemaVersion: 1,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
};

// A fictional v2 that renames `area` to `map`, to exercise the chain without a real migration.
const v2Schema = saveSchema.omit({ area: true }).extend({ map: saveSchema.shape.area });
const fake = {
  current: 2,
  schema: v2Schema,
  migrations: {
    1: (s: Record<string, unknown>) => {
      const { area, ...rest } = s;
      return { ...rest, map: area, schemaVersion: 2 };
    },
  },
};

describe("migrate", () => {
  it("passes a current save through", () => {
    expect(migrate(v1)).toEqual({ ok: true, save: v1 });
  });

  it("applies the chain up to the current version", () => {
    expect(migrate(v1, fake)).toMatchObject({ ok: true, save: { schemaVersion: 2, map: "60" } });
  });

  it("refuses a save newer than the app", () => {
    expect(migrate({ ...v1, schemaVersion: 2 })).toMatchObject({ ok: false, code: "save-too-new" });
  });

  it("fails when a step is missing", () => {
    expect(migrate(v1, { ...fake, current: 3, migrations: {} })).toMatchObject({ ok: false, code: "invalid" });
  });

  it.each([null, "x", [], {}, { schemaVersion: "1" }])("rejects %o", (raw) => {
    expect(migrate(raw)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("names the invalid field", () => {
    const result = migrate({ ...v1, name: "" });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(!result.ok && result.message).toContain("name");
  });
});
