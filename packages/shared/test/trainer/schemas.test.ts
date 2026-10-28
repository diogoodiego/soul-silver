import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTrainerFile, type TrainerFileKind } from "../../src/trainer/schemas.ts";

const content = (file: string) => JSON.parse(readFileSync(new URL(`../../../../content/trainer/${file}`, import.meta.url), "utf8")) as { value: Record<string, unknown> };
const FILES: Record<TrainerFileKind, string> = { aiFlags: "ai-flags.json", classProfiles: "class-profiles.json", tuning: "tuning.json" };

describe("trainer data", () => {
  it("accepts the bundled files", () => {
    for (const [kind, file] of Object.entries(FILES) as [TrainerFileKind, string][]) {
      expect(parseTrainerFile(kind, content(file), file)).toMatchObject({ ok: true });
    }
  });

  it.each([
    ["hpThreshold", 1.5, "switch"],
    ["hpThreshold", -0.1, "item"],
    ["typeThreshold", 3, "switch"],
  ])("rejects %s = %s with its path", (field, value, block) => {
    const raw = content("class-profiles.json") as { value: { default: Record<string, Record<string, unknown>> } };
    raw.value.default[block]![field] = value;
    expect(parseTrainerFile("classProfiles", raw, "class-profiles.json")).toMatchObject({ ok: false, error: { file: "class-profiles.json", path: `value.default.${block}.${field}` } });
  });

  it("rejects a flag bit outside 0 to 31", () => {
    const raw = content("ai-flags.json") as { value: { bits: Record<string, unknown> } };
    raw.value.bits["32"] = { name: "nope" };
    expect(parseTrainerFile("aiFlags", raw, "ai-flags.json")).toMatchObject({ ok: false, error: { file: "ai-flags.json" } });
  });
});
