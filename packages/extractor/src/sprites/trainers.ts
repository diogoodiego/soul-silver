import { spriteName } from "@soulsilver/shared/sprites";
import type { BattleResult } from "./battle.ts";
import { crop, pixelIndices, toRgba } from "./decode.ts";
import { TRAINER_GROUP } from "./layout.ts";
import { decryptTrainerPixels, readNclr, readNcgr } from "./nitro-gfx.ts";
import { footRow } from "./overworld.ts";

// Trainer sprites: group k of the archive holds the graphic (member +0), the palette (+1), the
// cells (+2), the animation (+3) and the encrypted 160 x 80 sheet (+4); its left 80 x 80 half is
// the sprite. Cells and animation are not used: the spec asks for the picture only.

const SIZE = 80;

export async function extractTrainers(read: (member: number) => Promise<Uint8Array>, count: number): Promise<BattleResult> {
  const result: BattleResult = { frames: [], sprites: [], missing: [], failed: [] };
  for (let k = 0; k < count; k++) {
    const name = spriteName("trainer", [k]);
    try {
      const palette = readNclr(await read(k * TRAINER_GROUP + 1));
      const gfx = readNcgr(await read(k * TRAINER_GROUP + 4));
      const width = gfx.tilesWide * 8;
      const indices = pixelIndices(gfx, decryptTrainerPixels(gfx.data));
      const sheet = toRgba(indices, width, gfx.tilesHigh * 8, palette, name);
      const image = crop(sheet, 0, 0, SIZE, SIZE);
      result.frames.push({ name, image, anchor: { x: SIZE >> 1, y: footRow([image]) } });
      result.sprites.push({ name, trainer: k, frames: [name], animations: [] });
    } catch (error) {
      result.failed.push({ sprite: name, reason: (error as Error).message });
    }
  }
  return result;
}
