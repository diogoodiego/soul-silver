import { describe, expect, it } from "vitest";
import { stageDropped } from "../../src/render/debuff";

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
