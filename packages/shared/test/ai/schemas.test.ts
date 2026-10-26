import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAiFile, type AiFileKind } from "../../src/ai/schemas.ts";

const content = (file: string) => JSON.parse(readFileSync(new URL(`../../../../content/ai/${file}`, import.meta.url), "utf8")) as { value: Record<string, unknown> };
const FILES: Record<AiFileKind, string> = { profiles: "profiles.json", temperaments: "temperaments.json", wildLevels: "wild-levels.json", tuning: "tuning.json" };
const profiles = () => content("profiles.json") as { value: { profiles: Record<string, unknown>[] } };

describe("ai data", () => {
  it("accepts the bundled files", () => {
    for (const [kind, file] of Object.entries(FILES) as [AiFileKind, string][]) {
      expect(parseAiFile(kind, content(file), file)).toMatchObject({ ok: true });
    }
  });

  it.each([
    ["sightAngleDeg", 0],
    ["sightAngleDeg", 361],
    ["typeKnowledge", 1.5],
    ["dodgeChance", -0.1],
    ["leadFactor", 2],
    ["temperature", 0],
  ])("rejects %s = %s with its path", (field, value) => {
    const raw = profiles();
    raw.value.profiles[0]![field] = value;
    expect(parseAiFile("profiles", raw, "profiles.json")).toMatchObject({ ok: false, error: { file: "profiles.json", path: `value.profiles.0.${field}` } });
  });

  it("rejects duplicate profile ids", () => {
    const raw = profiles();
    raw.value.profiles[1]!["id"] = raw.value.profiles[0]!["id"];
    expect(parseAiFile("profiles", raw, "profiles.json")).toMatchObject({ ok: false });
  });

  it("accepts trainer profiles with original AI flags (spec of trainers maps them later)", () => {
    const raw = profiles();
    Object.assign(raw.value.profiles[0]!, { source: "trainer", aiFlags: ["basic", "evaluate-attack"] });
    expect(parseAiFile("profiles", raw, "profiles.json")).toMatchObject({ ok: true });
  });

  it("requires the four temperaments", () => {
    const raw = content("temperaments.json");
    delete raw.value["territorial"];
    expect(parseAiFile("temperaments", raw, "temperaments.json")).toMatchObject({ ok: false });
  });

  it.each([
    ["a gap", [{ minLevel: 1, maxLevel: 10, profile: "novice" }, { minLevel: 12, maxLevel: 100, profile: "novice" }]],
    ["an overlap", [{ minLevel: 1, maxLevel: 10, profile: "novice" }, { minLevel: 10, maxLevel: 100, profile: "novice" }]],
    ["a missing top", [{ minLevel: 1, maxLevel: 50, profile: "novice" }]],
  ])("rejects level bands with %s", (_, bands) => {
    expect(parseAiFile("wildLevels", { kind: "ai-wild-levels", formatVersion: 1, value: { bands } }, "wild-levels.json")).toMatchObject({ ok: false });
  });
});
