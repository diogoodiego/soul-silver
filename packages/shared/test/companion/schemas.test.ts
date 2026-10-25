import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCompanionFile, type CompanionFileKind } from "../../src/companion/schemas.ts";

const content = (file: string) => JSON.parse(readFileSync(new URL(`../../../../content/companion/${file}`, import.meta.url), "utf8")) as { value: Record<string, unknown> };
const FILES: Record<CompanionFileKind, string> = { follow: "follow.json", reactions: "reactions.json", "battle-rules": "battle-rules.json" };

describe("companion data", () => {
  it("accepts the bundled files", () => {
    for (const [kind, file] of Object.entries(FILES) as [CompanionFileKind, string][]) {
      expect(parseCompanionFile(kind, content(file), file)).toMatchObject({ ok: true });
    }
  });

  it("needs exactly 9 money loss bases", () => {
    const raw = content("battle-rules.json");
    raw.value["moneyLossBase"] = [8, 16];
    expect(parseCompanionFile("battle-rules", raw, "battle-rules.json")).toMatchObject({ ok: false, error: { file: "battle-rules.json", path: "value.moneyLossBase" } });
  });

  it("needs a fallback reaction", () => {
    const raw = content("reactions.json");
    delete raw.value["fallback"];
    expect(parseCompanionFile("reactions", raw, "reactions.json")).toMatchObject({ ok: false, error: { path: "value.fallback" } });
  });

  it("rejects an unknown emotion with its path", () => {
    const raw = content("reactions.json");
    (raw.value["rules"] as { emotion: string }[])[2]!.emotion = "dance";
    expect(parseCompanionFile("reactions", raw, "reactions.json")).toMatchObject({ ok: false, error: { path: "value.rules.2.emotion" } });
  });
});
