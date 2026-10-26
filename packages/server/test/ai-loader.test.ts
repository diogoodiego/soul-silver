import { describe, expect, it } from "vitest";
import { buildAiData, BUNDLED_AI_CONTENT, type AiContent } from "../src/ai-loader";

const copy = () => JSON.parse(JSON.stringify(BUNDLED_AI_CONTENT)) as Record<keyof AiContent, { value: Record<string, unknown> }>;

describe("ai loader", () => {
  it("loads the bundled content/ai", () => {
    const data = buildAiData(BUNDLED_AI_CONTENT);
    expect(data.profiles.map((p) => p.id)).toContain("novice");
    expect(data.temperaments.aggressive.onSeePlayer).toBe("alert-approach");
  });

  it("names the file, the field and the problem", () => {
    const raw = copy();
    (raw.tuning.value["perception"] as Record<string, unknown>)["everyTicks"] = 0;
    expect(() => buildAiData(raw as unknown as AiContent)).toThrow(/content\/ai\/tuning\.json: value\.perception\.everyTicks: /);
  });

  it("rejects a level band pointing at a missing profile", () => {
    const raw = copy();
    raw.wildLevels.value["bands"] = [{ minLevel: 1, maxLevel: 100, profile: "ghost" }];
    expect(() => buildAiData(raw as unknown as AiContent)).toThrow(/content\/ai\/wild-levels\.json: value\.bands\.0\.profile: .*ghost/);
  });

  it("fails clearly when a file is missing", () => {
    const raw = copy() as Partial<Record<keyof AiContent, unknown>>;
    delete raw.profiles;
    expect(() => buildAiData(raw as AiContent)).toThrow(/content\/ai\/profiles\.json/);
  });
});
