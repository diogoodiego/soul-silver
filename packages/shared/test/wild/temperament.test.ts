import { describe, expect, it } from "vitest";
import { stepAi, type AiContext } from "../../src/wild/temperament.ts";

const T = 16;
const base: AiContext = {
  temperament: "passive",
  radii: { sightTiles: 5, detectTiles: 6, territoryTiles: 3 },
  leashTiles: 10,
  chaseLimitTiles: 10,
  self: { x: 0, y: 0 },
  origin: { x: 0, y: 0 },
  nearest: undefined,
  hurt: false,
  angry: false,
};
const at = (tiles: number) => ({ x: tiles * T, y: 0 });

describe("stepAi", () => {
  it("passive: keeps wandering near a player, flees when hurt", () => {
    expect(stepAi("wander", { ...base, nearest: at(1) })).toBe("wander");
    expect(stepAi("wander", { ...base, nearest: at(1), hurt: true })).toBe("flee");
    expect(stepAi("flee", { ...base, nearest: at(3) })).toBe("flee");
    expect(stepAi("flee", { ...base, nearest: at(7) })).toBe("wander");
  });

  it("skittish: flees as soon as a player is in sight", () => {
    const ctx = { ...base, temperament: "skittish" as const };
    expect(stepAi("wander", { ...ctx, nearest: at(6) })).toBe("wander");
    expect(stepAi("wander", { ...ctx, nearest: at(5) })).toBe("flee");
  });

  it("aggressive: chases a detected player and gives up past the chase limit", () => {
    const ctx = { ...base, temperament: "aggressive" as const };
    expect(stepAi("wander", { ...ctx, nearest: at(7) })).toBe("wander");
    expect(stepAi("wander", { ...ctx, nearest: at(6) })).toBe("chase");
    expect(stepAi("chase", { ...ctx, nearest: at(9) })).toBe("chase");
    expect(stepAi("chase", { ...ctx, nearest: at(11) })).toBe("wander");
    expect(stepAi("chase", ctx)).toBe("wander");
  });

  it("territorial: attacks inside its territory only", () => {
    const ctx = { ...base, temperament: "territorial" as const, origin: { x: 0, y: 0 } };
    expect(stepAi("wander", { ...ctx, nearest: at(3) })).toBe("chase");
    expect(stepAi("wander", { ...ctx, nearest: at(4) })).toBe("wander");
    expect(stepAi("chase", { ...ctx, nearest: at(4) })).toBe("wander");
  });

  it("any temperament: angry after an escape means chase", () => {
    expect(stepAi("wander", { ...base, angry: true, nearest: at(6) })).toBe("chase");
  });

  it("walks back past the leash, and wanders again once home", () => {
    const ctx = { ...base, temperament: "aggressive" as const, nearest: at(12) };
    expect(stepAi("chase", { ...ctx, self: at(11) })).toBe("return");
    expect(stepAi("return", { ...ctx, self: at(5), nearest: at(6) })).toBe("return");
    expect(stepAi("return", { ...ctx, self: { x: 4, y: 0 } })).toBe("wander");
  });
});
