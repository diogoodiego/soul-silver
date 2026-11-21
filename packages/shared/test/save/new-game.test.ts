import { describe, expect, it } from "vitest";
import { MAP_TILE_PX } from "../../src/maps/index.ts";
import { applyNewGame, NEW_GAME_FLAGS } from "../../src/save/new-game.ts";
import { migrate } from "../../src/save/migrate.ts";

// Spec 024: a new save starts where NewGame_InitSaveData puts it (research R1).

const created = () => {
  const result = migrate({ schemaVersion: 1, name: "Gold", character: "male", area: "60", x: 0, y: 0, facing: "north", playTimeMs: 0, savedAt: "2026-10-28T12:00:00.000Z", rev: 0 });
  if (!result.ok) throw new Error(result.message);
  return result.save;
};

describe("applyNewGame", () => {
  it("puts the player in the start tile with the code's flags, an empty party and Pokédex", () => {
    const save = applyNewGame(created(), { map: 64, tx: 6, ty: 6, facing: "south" });
    expect(save).toMatchObject({ area: "64", x: 6.5 * MAP_TILE_PX, y: 6.5 * MAP_TILE_PX, facing: "south", party: [], pokedex: { seen: [], caught: [] }, vars: {}, storyRev: 1 });
    expect(save.flags).toEqual([...NEW_GAME_FLAGS]);
    expect(NEW_GAME_FLAGS).toContain(960);
    expect(migrate(save).ok).toBe(true);
  });
});

describe("arenaSave", () => {
  it("is a valid, empty save with the arena's trainer and nothing caught or carried", async () => {
    const { arenaSave } = await import("../../src/save/new-game.ts");
    const save = arenaSave("Teste", "female", "2026-11-20T00:00:00.000Z");
    expect(migrate(save)).toEqual({ ok: true, save });
    expect(save).toMatchObject({ name: "Teste", character: "female", party: [], bag: [], pokedex: { seen: [], caught: [] }, flags: [], vars: {} });
  });

  it("trims the name, as a new game does", async () => {
    const { arenaSave } = await import("../../src/save/new-game.ts");
    expect(arenaSave("  Ash ", "male", "2026-11-20T00:00:00.000Z").name).toBe("Ash");
  });
});
