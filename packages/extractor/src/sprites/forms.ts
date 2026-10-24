import { spriteName, type SpriteEntry } from "@soulsilver/shared/sprites";
import { firstFrame, type BattleResult } from "./battle.ts";
import { toRgba } from "./decode.ts";
import { FORM_GRAPHICS, FORM_GROUPS } from "./layout.ts";
import { readNclr } from "./nitro-gfx.ts";

/**
 * Battle sprites of the alternative forms (form 1 and up; form 0 comes from the main archive).
 * Forms have no gender variants: they are `unisex`.
 */
export async function extractForms(read: (index: number) => Promise<Uint8Array>): Promise<BattleResult> {
  const result: BattleResult = { frames: [], sprites: [], missing: [], failed: [] };
  let pair = 0;
  for (const group of FORM_GROUPS) {
    for (let form = 0; form < group.forms; form++, pair++) {
      if (group.species === 0 || form === 0) continue;
      const label = spriteName("battle", [group.species, form]);
      try {
        const palette = group.pal + (group.shared ? 0 : form);
        const normal = readNclr(await read(FORM_GRAPHICS + 2 * palette));
        const shiny = readNclr(await read(FORM_GRAPHICS + 2 * palette + 1));
        const names: string[] = [];
        for (const [view, offset] of [["back", 0], ["front", 1]] as const) {
          const px = firstFrame(await read(2 * pair + offset));
          const name = spriteName("battle", [group.species, form, view, "unisex"]);
          result.frames.push({
            name,
            image: toRgba(px.indices, px.width, px.height, normal, name),
            shiny: toRgba(px.indices, px.width, px.height, shiny, name),
            anchor: { x: px.width >> 1, y: px.height },
          });
          names.push(name);
        }
        const entry: SpriteEntry = { name: spriteName("battle", [group.species, form, "unisex"]), species: group.species, form, gender: "unisex", frames: names.reverse(), animations: [] };
        result.sprites.push(entry);
      } catch (error) {
        result.failed.push({ sprite: label, reason: (error as Error).message });
      }
    }
  }
  return result;
}
