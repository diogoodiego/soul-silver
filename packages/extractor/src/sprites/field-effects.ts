import { spriteName } from "@soulsilver/shared/sprites";
import { readNitroBlocks } from "../maps/nitro.ts";
import { decodeTexture, readTextureSet } from "../maps/texture.ts";
import type { BattleResult } from "./battle.ts";
import { GRASS_EFFECT_MEMBER } from "./layout.ts";
import { footRow } from "./overworld.ts";

// Field effects drawn over the map: for now the tall grass rustle, the textures kusaeff.1 to .4
// (32 x 32, the tuft at the bottom) of a 3D texture file in the field effect archive.

/** shortcut: frame time guessed from the look in game, not read from the ROM; read it when the effect code is decoded. */
const GRASS_FRAME_MS = 80;
const GRASS_FRAMES = 4;

export async function extractFieldEffects(read: (member: number) => Promise<Uint8Array>): Promise<BattleResult> {
  const result: BattleResult = { frames: [], sprites: [], missing: [], failed: [] };
  const sprite = spriteName("field-effect", ["grass"]);
  try {
    const bytes = await read(GRASS_EFFECT_MEMBER);
    const tex0 = readNitroBlocks(bytes, "BTX0").get("TEX0");
    if (tex0 === undefined) throw new Error("o arquivo não tem bloco TEX0");
    const set = readTextureSet(bytes, tex0);
    const images = Array.from({ length: GRASS_FRAMES }, (_, k) => {
      const texture = set.textures.get(`kusaeff.${k + 1}`);
      if (!texture) throw new Error(`falta a textura kusaeff.${k + 1}`);
      return decodeTexture(texture, set.palettes.get("kusaeff"));
    });
    const anchor = { x: images[0]!.width >> 1, y: footRow(images) };
    const names = images.map((image, k) => {
      const name = spriteName("field-effect", ["grass", k]);
      result.frames.push({ name, image, anchor });
      return name;
    });
    result.sprites.push({
      name: sprite,
      frames: [],
      animations: [{ name: "rustle", loop: false, steps: names.map((frame) => ({ frame, ms: GRASS_FRAME_MS, flipX: false })) }],
    });
  } catch (error) {
    result.failed.push({ sprite, reason: (error as Error).message });
  }
  return result;
}
