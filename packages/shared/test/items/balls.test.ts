import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ballMultiplier, type BallContext } from "../../src/wild/capture.ts";
import { parseWildFile } from "../../src/wild/schemas.ts";

// Spec 027, US5: each of Kurt's balls with its original catch modifier (content/wild/balls.json).

const raw = JSON.parse(readFileSync(new URL("../../../../content/wild/balls.json", import.meta.url), "utf8")) as unknown;
const parsed = parseWildFile("balls", raw, "balls.json");
if (!parsed.ok) throw new Error(parsed.error.problem);
const balls = (parsed.data as { value: { balls: Record<string, Parameters<typeof ballMultiplier>[0]> } }).value.balls;
const ctx = (over: Partial<BallContext> = {}): BallContext => ({ night: false, cave: false, turns: 3, types: [0], level: 10, baseSpeed: 50, moonEvolver: false, caughtBefore: false, userLevel: 10, ...over });
const mult = (id: number, over: Partial<BallContext> = {}) => ballMultiplier(balls[String(id)]!, ctx(over));

describe("Kurt's balls", () => {
  it("Fast Ball: ×4 on a Pokémon of base Speed 100 or more", () => {
    expect(mult(492, { baseSpeed: 100 })).toBe(4);
    expect(mult(492, { baseSpeed: 99 })).toBe(1);
  });

  it("Level Ball: ×2, ×4 or ×8 as the user's level passes 1, 2 or 4 times the target's", () => {
    expect(mult(493, { userLevel: 10, level: 10 })).toBe(1);
    expect(mult(493, { userLevel: 11, level: 10 })).toBe(2);
    expect(mult(493, { userLevel: 21, level: 10 })).toBe(4);
    expect(mult(493, { userLevel: 41, level: 10 })).toBe(8);
  });

  it("Lure Ball: ×3 on a Pokémon hooked with a rod", () => {
    expect(mult(494, { fished: true })).toBe(3);
    expect(mult(494)).toBe(1);
  });

  it("Moon Ball: ×4 on a Pokémon that evolves with a Moon Stone", () => {
    expect(mult(498, { moonEvolver: true })).toBe(4);
    expect(mult(498)).toBe(1);
  });

  it("Friend Ball: ×1, and the Pokémon starts at friendship 200", () => {
    expect(mult(497)).toBe(1);
    expect(balls["497"]!.friendship).toBe(200);
  });

  it("Heavy and Love Balls: ×1 until the data has weight and gender (docs/balance-log.md)", () => {
    expect(mult(495)).toBe(1);
    expect(mult(496)).toBe(1);
  });
});
