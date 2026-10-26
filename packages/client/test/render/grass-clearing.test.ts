import type { Entity } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { clearings, MAX_CLEARINGS } from "../../src/render/grass-clearing";

const mon = (id: number, x: number, owner: string, hpMax = 20): Entity => ({ id, kind: "pokemon", area: "a", x, y: 0, level: 0, facing: "south", data: { owner, hpMax, hp: hpMax } });

describe("grass clearings", () => {
  it("clears around a player's Pokémon in combat and the wild ones fighting near it", () => {
    const at = clearings([mon(1, 0, "1"), mon(2, 40, "wild"), mon(3, 2000, "wild")]);
    expect(at).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
    ]);
  });

  it("clears nothing with no fight: a companion following or wild ones alone", () => {
    const companion: Entity = { id: 1, kind: "pokemon", area: "a", x: 0, y: 0, level: 0, facing: "south", data: { role: "companion" } };
    expect(clearings([companion, mon(2, 40, "wild")])).toEqual([]);
  });

  it("caps the number of circles", () => {
    expect(clearings(Array.from({ length: 20 }, (_, i) => mon(i, i * 10, i === 0 ? "1" : "wild")))).toHaveLength(MAX_CLEARINGS);
  });
});
