import { migrate } from "./migrate.ts";
import { applyNewGame, type NewGameStart } from "./new-game.ts";
import type { Save } from "./schema.ts";

/**
 * The story from the start in the same slot (spec 024, research R5): who the player is and how long
 * they played stay, and so do the trainer card's ID and start date (block H); everything else is a new
 * game's. The server runs the init script again on joining.
 */
export function restartStory(save: Save, start: NewGameStart): Save {
  const { name, character, playTimeMs, savedAt, rev, trainerId, startedAt } = save;
  const base = migrate({ schemaVersion: 1, name, character, area: "0", x: 0, y: 0, facing: "south", playTimeMs, savedAt, rev });
  if (!base.ok) throw new Error(base.message);
  const { startedAt: _, ...story } = applyNewGame(base.save, start);
  return { ...story, trainerId, ...(startedAt === undefined ? {} : { startedAt }) };
}
