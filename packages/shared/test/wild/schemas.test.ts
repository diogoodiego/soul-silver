import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWildFile, type WildFileKind } from "../../src/wild/schemas.ts";

const content = (file: string) => JSON.parse(readFileSync(new URL(`../../../../content/wild/${file}`, import.meta.url), "utf8")) as { value: Record<string, unknown> };
const FILES: Record<WildFileKind, string> = { spawn: "spawn.json", temperaments: "temperaments.json", balls: "balls.json" };

describe("wild data", () => {
  it("accepts the bundled files", () => {
    for (const [kind, file] of Object.entries(FILES) as [WildFileKind, string][]) {
      expect(parseWildFile(kind, content(file), file)).toMatchObject({ ok: true });
    }
  });

  it("rejects an unknown temperament with its path", () => {
    const raw = content("temperaments.json");
    (raw.value["species"] as Record<string, string>)["19"] = "grumpy";
    expect(parseWildFile("temperaments", raw, "temperaments.json")).toMatchObject({ ok: false, error: { file: "temperaments.json", path: "value.species.19" } });
  });

  it("rejects a species outside 1–493", () => {
    const raw = content("temperaments.json");
    (raw.value["species"] as Record<string, string>)["494"] = "passive";
    expect(parseWildFile("temperaments", raw, "temperaments.json")).toMatchObject({ ok: false });
  });

  it("rejects an unknown ball condition", () => {
    const raw = content("balls.json");
    (raw.value["balls"] as Record<string, unknown>)["4"] = { mult: 1, when: "rainy" };
    expect(parseWildFile("balls", raw, "balls.json")).toMatchObject({ ok: false, error: { path: "value.balls.4.when" } });
  });

  it("needs types when the condition is types", () => {
    const raw = content("balls.json");
    (raw.value["balls"] as Record<string, unknown>)["6"] = { mult: 3, when: "types" };
    expect(parseWildFile("balls", raw, "balls.json")).toMatchObject({ ok: false });
  });
});
