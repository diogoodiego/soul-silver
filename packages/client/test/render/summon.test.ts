import { describe, expect, it } from "vitest";
import { SUMMON_MS, summonPhase } from "../../src/render/summon";

// The swap animation: a red beam leaves the trainer and the Pokémon forms out of it.

describe("summonPhase", () => {
  it("starts with the beam leaving the trainer and the Pokémon not there yet", () => {
    const p = summonPhase(0);
    expect(p.beam).toEqual({ tail: 0, head: 0 });
    expect(p.visible).toBe(false);
  });

  it("reaches the Pokémon, then the beam's tail follows it in and the beam is gone", () => {
    expect(summonPhase(150).beam).toEqual({ tail: 0, head: 1 });
    expect(summonPhase(225).beam!.tail).toBeCloseTo(0.5);
    expect(summonPhase(300).beam).toBeUndefined();
  });

  it("forms the Pokémon red and small, growing to full size, then in its own colours", () => {
    const forming = summonPhase(200);
    expect(forming).toMatchObject({ visible: true, red: true });
    expect(forming.scale).toBeGreaterThan(0.15);
    expect(forming.scale).toBeLessThan(1);
    expect(summonPhase(420).scale).toBe(1);
    expect(summonPhase(500)).toMatchObject({ red: false, scale: 1, done: false });
  });

  it("is done after SUMMON_MS", () => {
    expect(summonPhase(SUMMON_MS)).toMatchObject({ done: true, visible: true, red: false, scale: 1, beam: undefined });
  });
});
