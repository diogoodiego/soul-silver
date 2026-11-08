import { describe, expect, it } from "vitest";
import { pickReaction, placeOf } from "../../src/companion/reactions.ts";
import type { ReactionRules } from "../../src/companion/schemas.ts";

const RULES: ReactionRules = {
  bank: 1,
  towns: [10],
  rules: [
    { when: { place: "town" }, emotion: "note", text: 1 },
    { when: { place: "town", time: "night" }, emotion: "sleep", text: 2 },
    { when: { place: "cave" }, emotion: "sweat", text: 3 },
    { when: { place: "cave" }, emotion: "question", text: 4 },
    { when: { friendshipMin: 200 }, emotion: "heart", text: 5 },
    { when: { friendshipMax: 69 }, emotion: "sweat", text: 6 },
  ],
  fallback: { emotion: "note", text: 99 },
};
const first = () => 0;

describe("placeOf", () => {
  it("reads caves and interiors from the area type and towns from the mapsec list", () => {
    expect(placeOf("cave", 10, RULES.towns)).toBe("cave");
    expect(placeOf("indoor", 10, RULES.towns)).toBe("indoor");
    expect(placeOf("outdoor", 10, RULES.towns)).toBe("town");
    expect(placeOf("outdoor", 11, RULES.towns)).toBe("route");
    expect(placeOf(undefined, undefined, RULES.towns)).toBe("route");
  });
});

describe("pickReaction", () => {
  const ctx = { place: "town" as const, time: "day" as const, friendship: 100 };

  it("changes with the place and the time", () => {
    expect(pickReaction(RULES, ctx, first).text).toBe(1);
    expect(pickReaction(RULES, { ...ctx, time: "night" }, first).text).toBe(2);
  });

  it("prefers the rule with more conditions", () => {
    expect(pickReaction(RULES, { ...ctx, time: "night", friendship: 255 }, first).text).toBe(2);
  });

  it("filters by friendship", () => {
    expect(pickReaction(RULES, { place: "route", time: "day", friendship: 220 }, first).text).toBe(5);
    expect(pickReaction(RULES, { place: "route", time: "day", friendship: 10 }, first).text).toBe(6);
  });

  it("breaks ties with the roll", () => {
    const cave = { place: "cave" as const, time: "day" as const, friendship: 100 };
    expect(pickReaction(RULES, cave, () => 0).text).toBe(3);
    expect(pickReaction(RULES, cave, () => 1).text).toBe(4);
  });

  it("falls back when nothing matches", () => {
    expect(pickReaction(RULES, { place: "indoor", time: "day", friendship: 100 }, first)).toEqual({ emotion: "note", text: 99 });
  });
});
