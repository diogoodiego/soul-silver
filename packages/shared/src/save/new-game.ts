import { MAP_TILE_PX } from "../maps/index.ts";
import { migrate } from "./migrate.ts";
import { STORY_REV, type Save } from "./schema.ts";

/** Flags NewGame_InitSaveData sets in code, not in a script (research R1): FLAG_UNK_960. */
export const NEW_GAME_FLAGS: readonly number[] = [960];

/** `tx`, `ty` count from the map's top-left corner (not the matrix, as new-game.json does). */
export interface NewGameStart {
  map: number;
  tx: number;
  ty: number;
  facing: Save["facing"];
}

/**
 * A save as a new game leaves it before the init script runs: in the start tile, with the code's
 * flags and nothing caught. The server then runs the init script (_std_init) once.
 */
/** A save as applyNewGame left it: no variable yet and only the code's flags, so the init script has not run. */
export function storyUnstarted(save: Pick<Save, "flags" | "vars">): boolean {
  return Object.keys(save.vars).length === 0 && save.flags.length === NEW_GAME_FLAGS.length && NEW_GAME_FLAGS.every((f) => save.flags.includes(f));
}

export function applyNewGame(save: Save, start: NewGameStart): Save {
  return {
    ...save,
    area: String(start.map),
    x: (start.tx + 0.5) * MAP_TILE_PX,
    y: (start.ty + 0.5) * MAP_TILE_PX,
    facing: start.facing,
    party: [],
    pokedex: { seen: [], caught: [] },
    flags: [...NEW_GAME_FLAGS],
    vars: {},
    storyRev: STORY_REV,
    // Block H: the trainer card's start date is the slot's creation.
    startedAt: save.savedAt,
  };
}

/**
 * The dev arena's save (spec 013): a blank one in memory, never written, carrying only the arena's trainer.
 * The arena is tied to no slot, so the hello and the HUD (bag, dex, name) read this instead.
 */
export function arenaSave(name: string, character: Save["character"], now: string): Save {
  const result = migrate({ schemaVersion: 1, name: name.trim(), character, area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: now, rev: 0 });
  if (!result.ok) throw new Error(`arena save: ${result.message}`);
  return result.save;
}
