import { describe, expect, it } from "vitest";
import { Scene } from "three";
import type { Entity } from "@soulsilver/shared/game";
import { createDebuffs, stageDropped } from "../../src/render/debuff";

describe("createDebuffs", () => {
  it("drops the specks of a knocked out Pokémon, and starts none on it", () => {
    const scene = new Scene();
    const debuffs = createDebuffs(scene);
    const draw = (data: Entity["data"], now: number) => debuffs.draw([{ id: 1, kind: "pokemon", area: "a", x: 0, y: 0, level: 0, facing: "south", data }], () => 0, now, 1);
    draw({ hp: 10 }, 0);
    draw({ hp: 10, stg_attack: -1 }, 50);
    expect(scene.children).toHaveLength(1);
    draw({ hp: 0, stg_attack: -2 }, 100);
    expect(scene.children).toHaveLength(0);
  });
});

describe("stageDropped", () => {
  it("sees a stage going down, from 0 or from a raised stage", () => {
    expect(stageDropped({}, { stg_attack: -1 })).toBe(true);
    expect(stageDropped({ stg_defense: 2 }, { stg_defense: 1 })).toBe(true);
    // Haze clears a raised stage: the key goes away.
    expect(stageDropped({ stg_speed: 2 }, {})).toBe(true);
  });

  it("ignores rises and unchanged stages", () => {
    expect(stageDropped({}, { stg_attack: 2 })).toBe(false);
    expect(stageDropped({ stg_attack: -1, hp: 30 }, { stg_attack: -1, hp: 10 })).toBe(false);
  });
});
