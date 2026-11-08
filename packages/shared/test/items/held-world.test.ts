import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ItemRecord } from "../../src/game-data/items.ts";
import { apricornReady, berryStage, damageMul, dayKey, daysBetween, dowse, heldOf, kurtReady, parseItemFile, thresholdHeal } from "../../src/items/index.ts";

// Spec 027, US3 and US5/US6: held items by their extracted hold effect, and the clock rules of the world items.

const raw = JSON.parse(readFileSync(new URL("../../../../content/items/effects.json", import.meta.url), "utf8")) as unknown;
const parsed = parseItemFile("effects", raw, "effects.json");
if (!parsed.ok) throw new Error(parsed.error.problem);
const effects = parsed.data.value;
const rec = (id: number, pocket: ItemRecord["pocket"], holdId: number, parameter: number) => ({ id, pocket, holdEffect: { id: holdId, parameter } });

describe("held items (content/items/effects.json)", () => {
  it("Oran Berry heals its 10 HP at half HP or less, and is used up", () => {
    const oran = heldOf(rec(155, "berries", 1, 10), effects)!;
    expect(oran.consumable).toBe(true);
    expect(thresholdHeal(oran, 30, 60)).toBe(10);
    expect(thresholdHeal(oran, 31, 60)).toBe(0);
    expect(thresholdHeal(oran, 0, 60)).toBe(0);
    expect(thresholdHeal(oran, 55 - 50, 10)).toBe(5);
  });

  it("Sitrus Berry heals 25% of max HP; Figy-style berries heal 1/8", () => {
    expect(thresholdHeal(heldOf(rec(158, "berries", 13, 25), effects)!, 40, 100)).toBe(25);
    expect(thresholdHeal(heldOf(rec(159, "berries", 14, 8), effects)!, 40, 100)).toBe(12);
  });

  it("the status berries cure their status; Lum cures every one", () => {
    expect(heldOf(rec(149, "berries", 5, 0), effects)!.effect).toEqual({ trigger: "cure", statuses: ["paralysis"] });
    expect(heldOf(rec(151, "berries", 7, 0), effects)!.effect).toEqual({ trigger: "cure", statuses: ["poison", "toxic"] });
    const lum = heldOf(rec(157, "berries", 12, 0), effects)!.effect as { trigger: string; statuses: string[] };
    expect(lum.trigger).toBe("cure");
    expect([...lum.statuses].sort()).toEqual(["burn", "confusion", "freeze", "paralysis", "poison", "sleep", "toxic"]);
  });

  it("Leftovers regenerates 1/16 and stays; Focus Sash is used up; Focus Band stays", () => {
    expect(heldOf(rec(234, "items", 69, 10), effects)).toMatchObject({ effect: { trigger: "regen", fraction: 0.0625 }, consumable: false });
    expect(heldOf(rec(275, "items", 103, 0), effects)).toMatchObject({ effect: { trigger: "survive", fullHpOnly: true }, consumable: true });
    expect(heldOf(rec(230, "items", 65, 10), effects)).toMatchObject({ effect: { trigger: "survive", fullHpOnly: false }, consumable: false });
  });

  it("type boosters add their parameter in percent to their type only; Choice Band to physical moves", () => {
    const charcoal = heldOf(rec(249, "items", 84, 20), effects);
    expect(damageMul(charcoal, 10, "special", 1)).toBeCloseTo(1.2);
    expect(damageMul(charcoal, 11, "special", 1)).toBe(1);
    const band = heldOf(rec(220, "items", 55, 0), effects);
    expect(damageMul(band, 0, "physical", 1)).toBe(1.5);
    expect(damageMul(band, 0, "special", 1)).toBe(1);
    expect(damageMul(heldOf(rec(268, "items", 96, 20), effects), 0, "physical", 2)).toBe(1.2);
    expect(damageMul(heldOf(rec(268, "items", 96, 20), effects), 0, "physical", 1)).toBe(1);
  });

  it("an item with no hold effect holds nothing; every hold effect id has an entry", () => {
    expect(heldOf(rec(17, "medicine", 0, 20), effects)).toBeUndefined();
    for (let id = 1; id <= 146; id++) expect(effects.held[String(id)], `efeito ${id}`).toBeDefined();
  });
});

describe("world items on the clock", () => {
  it("days are the host's calendar days, back included", () => {
    expect(dayKey(new Date(2026, 10, 7, 23, 59))).toBe("2026-11-07");
    expect(daysBetween("2026-11-07", "2026-11-08")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-11-08", "2026-11-07")).toBe(-1);
  });

  it("an apricorn tree picked today is empty until tomorrow; another tree is not", () => {
    const picked = { day: "2026-11-07", trees: [3] };
    expect(apricornReady(picked, 3, "2026-11-07")).toBe(false);
    expect(apricornReady(picked, 4, "2026-11-07")).toBe(true);
    expect(apricornReady(picked, 3, "2026-11-08")).toBe(true);
  });

  it("Kurt's balls are ready the next day, not before, and not when the clock went back", () => {
    expect(kurtReady("2026-11-07", "2026-11-07", 1)).toBe(false);
    expect(kurtReady("2026-11-07", "2026-11-08", 1)).toBe(true);
    expect(kurtReady("2026-11-07", "2026-11-06", 1)).toBe(false);
  });

  it("a Berry Pot plant grows one stage per period and stays ripe; a clock set back keeps it planted", () => {
    const h = 3_600_000;
    expect(berryStage(0, 3)).toBe("planted");
    expect(berryStage(3 * h, 3)).toBe("sprouted");
    expect(berryStage(11.9 * h, 3)).toBe("blooming");
    expect(berryStage(12 * h, 3)).toBe("ripe");
    expect(berryStage(99 * h, 3)).toBe("ripe");
    expect(berryStage(-5 * h, 3)).toBe("planted");
  });

  it("the Dowsing MCHN points at the nearest target in range: north is 0, east 90", () => {
    expect(dowse({ x: 0, y: 0 }, [{ x: 0, y: -5 }, { x: 8, y: 0 }], 10)).toEqual({ dir: 0, near: 0.5 });
    expect(dowse({ x: 0, y: 0 }, [{ x: 4, y: 0 }], 10)).toEqual({ dir: 90, near: 0.6 });
    expect(dowse({ x: 0, y: 0 }, [{ x: 11, y: 0 }], 10)).toBeUndefined();
    expect(dowse({ x: 0, y: 0 }, [], 10)).toBeUndefined();
  });
});
