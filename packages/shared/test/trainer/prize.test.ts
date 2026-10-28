import { describe, expect, it } from "vitest";
import { prize } from "../../src/trainer/prize.ts";

describe("prize", () => {
  it("is the class base times the last Pokémon's level times 4", () => {
    expect(prize({ prizeBase: 4, team: [{ level: 2 }, { level: 3 }], double: false })).toBe(48);
  });

  it("doubles in a double battle", () => {
    expect(prize({ prizeBase: 4, team: [{ level: 3 }], double: true })).toBe(96);
  });

  it("is 0 for a class with no prize", () => {
    expect(prize({ prizeBase: 0, team: [{ level: 50 }], double: false })).toBe(0);
  });
});
