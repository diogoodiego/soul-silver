import { describe, expect, it } from "vitest";
import { profileFor } from "../../src/ai/profile.ts";
import { profile } from "./fixtures.ts";

const profiles = [profile("novice"), profile("veteran")];
const table = { bands: [{ minLevel: 1, maxLevel: 10, profile: "novice" }, { minLevel: 11, maxLevel: 100, profile: "veteran" }] };

describe("profile by level (US3)", () => {
  it("early routes get the slow profile, later ones a better one", () => {
    expect(profileFor(3, table, profiles).id).toBe("novice");
    expect(profileFor(40, table, profiles).id).toBe("veteran");
  });

  it("changing the table changes the profile, no code involved", () => {
    expect(profileFor(3, { bands: [{ minLevel: 1, maxLevel: 100, profile: "veteran" }] }, profiles).id).toBe("veteran");
  });

  it("a novice reacts slowly, aims poorly and barely dodges", () => {
    const n = profile("novice");
    const v = profile("veteran");
    expect(n.reactionS).toBeGreaterThan(v.reactionS);
    expect(n.aimErrorDeg).toBeGreaterThan(v.aimErrorDeg);
    // Block C: trainers of a better profile dodge and parry more often (wild Pokémon use one chance for all).
    expect(n.reactChance).toBeLessThan(v.reactChance);
  });

  it("fails clearly for a level outside the table or a missing profile", () => {
    expect(() => profileFor(101, table, profiles)).toThrow(/101/);
    expect(() => profileFor(3, { bands: [{ minLevel: 1, maxLevel: 100, profile: "ghost" }] }, profiles)).toThrow(/ghost/);
  });
});
