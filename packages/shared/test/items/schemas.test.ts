import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseItemFile, type ItemFileKind } from "../../src/items/schemas.ts";

// Spec 027: the hand-written item effects, the item tuning and the companion's finds.

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../../content/${path}`, import.meta.url), "utf8")) as { value: Record<string, unknown> };
const FILES: Record<ItemFileKind, string> = { effects: "items/effects.json", tuning: "items/tuning.json", finds: "companion/finds.json" };

describe("item data", () => {
  it("accepts the bundled files", () => {
    for (const [kind, file] of Object.entries(FILES) as [ItemFileKind, string][]) expect(parseItemFile(kind, read(file), file)).toMatchObject({ ok: true });
  });

  it("rejects an unknown use archetype, with the file and path", () => {
    const raw = read(FILES.effects);
    (raw.value["use"] as Record<string, unknown>)["79"] = { archetype: "teleport" };
    expect(parseItemFile("effects", raw, "effects.json")).toMatchObject({ ok: false, error: { file: "effects.json", path: "value.use.79.archetype" } });
  });

  it("rejects an unknown held trigger", () => {
    const raw = read(FILES.effects);
    (raw.value["held"] as Record<string, unknown>)["1"] = { trigger: "explode" };
    expect(parseItemFile("effects", raw, "effects.json")).toMatchObject({ ok: false, error: { path: "value.held.1.trigger" } });
  });

  it("rejects a negative use time or cooldown", () => {
    const raw = read(FILES.tuning);
    (raw.value["combat"] as Record<string, { useS: number }>)["heal"]!.useS = -1;
    expect(parseItemFile("tuning", raw, "tuning.json")).toMatchObject({ ok: false, error: { path: "value.combat.heal.useS" } });
  });

  it("rejects a PP Up step outside 0..1 and a yield range upside down", () => {
    const pp = read(FILES.tuning);
    (pp.value["ppUp"] as { perLevel: number }).perLevel = 1.5;
    expect(parseItemFile("tuning", pp, "tuning.json")).toMatchObject({ ok: false, error: { path: "value.ppUp.perLevel" } });
    const berry = read(FILES.tuning);
    berry.value["berryYield"] = [5, 2];
    expect(parseItemFile("tuning", berry, "tuning.json")).toMatchObject({ ok: false, error: { path: "value.berryYield" } });
  });

  it("rejects a find place outside the companion's places", () => {
    const raw = read(FILES.finds);
    (raw.value["places"] as Record<string, unknown>)["sky"] = [{ item: 17, weight: 1 }];
    expect(parseItemFile("finds", raw, "finds.json")).toMatchObject({ ok: false });
  });

  it("maps the Kurt balls in colour order: red Level … black Heavy", () => {
    expect((read(FILES.tuning).value["apricornBalls"] as number[])).toEqual([493, 498, 494, 497, 496, 492, 495]);
  });
});
