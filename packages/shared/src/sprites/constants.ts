// Sprite atlases; see specs/007-sprite-atlas/data-model.md.
import { GAME_DATA_FORMAT_VERSION } from "../game-data/common.ts";

/** Version of the sprite file format; bumped when a sprite schema changes. */
export const SPRITE_FORMAT_VERSION = GAME_DATA_FORMAT_VERSION;

/** Largest atlas page side, in pixels (research R2). */
export const ATLAS_MAX_SIZE = 2048;

export const SPRITE_CATEGORIES = [
  "overworld-player",
  "overworld-npc",
  "overworld-pokemon",
  "battle",
  "icon-pokemon",
  "icon-item",
  "trainer",
  "field-effect",
  "battle-fx",
] as const;
export type SpriteCategory = (typeof SPRITE_CATEGORIES)[number];
