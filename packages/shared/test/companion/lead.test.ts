import { describe, expect, it } from "vitest";
import { leadIndex } from "../../src/companion/lead.ts";

describe("leadIndex", () => {
  it("is the first member that has not fainted", () => {
    expect(leadIndex([{ hp: 10 }, { hp: 5 }])).toBe(0);
    expect(leadIndex([{ hp: 0 }, { hp: 0 }, { hp: 3 }])).toBe(2);
  });

  it("follows a reordered party", () => {
    const a = { hp: 4 };
    const b = { hp: 9 };
    expect(leadIndex([b, a])).toBe(0);
    expect(leadIndex([{ hp: 0 }, a, b])).toBe(1);
  });

  it("is undefined when everyone fainted or the party is empty", () => {
    expect(leadIndex([{ hp: 0 }, { hp: 0 }])).toBeUndefined();
    expect(leadIndex([])).toBeUndefined();
  });
});
