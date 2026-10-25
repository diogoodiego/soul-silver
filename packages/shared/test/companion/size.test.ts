import { describe, expect, it } from "vitest";
import { largeSpeciesOf } from "../../src/companion/size.ts";

const frame = (name: string, w: number, h: number) => ({ name, w, h });
const sprite = (species: number, f: string) => ({ species, frames: [], animations: [{ steps: [{ frame: f }] }] });

describe("largeSpeciesOf", () => {
  const set = {
    frames: [frame("a", 32, 32), frame("b", 64, 64), frame("c", 32, 40)],
    sprites: [sprite(1, "a"), sprite(208, "b"), sprite(7, "c"), { frames: ["a"], animations: [] }],
  };

  it("marks species whose frame is wider or taller than the limit", () => {
    expect([...largeSpeciesOf(set, { largeFramePx: 32, largeSpecies: [] })].sort((x, y) => x - y)).toEqual([7, 208]);
  });

  it("adds the species listed in the data", () => {
    expect(largeSpeciesOf(set, { largeFramePx: 32, largeSpecies: [95] }).has(95)).toBe(true);
  });
});
