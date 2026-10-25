import { describe, expect, it } from "vitest";
import { markCaught, markSeen } from "../../src/wild/pokedex.ts";

describe("pokedex", () => {
  it("marks a species seen once", () => {
    const dex = { seen: [16], caught: [] };
    expect(markSeen(dex, 19)).toBe(true);
    expect(markSeen(dex, 19)).toBe(false);
    expect(dex).toEqual({ seen: [16, 19], caught: [] });
  });

  it("marks a catch as seen too", () => {
    const dex = { seen: [], caught: [] };
    expect(markCaught(dex, 161)).toBe(true);
    expect(markCaught(dex, 161)).toBe(false);
    expect(dex).toEqual({ seen: [161], caught: [161] });
  });
});
