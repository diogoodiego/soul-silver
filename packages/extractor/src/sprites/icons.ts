import { readU16 } from "../binary.ts";
import type { BattleResult } from "./battle.ts";
import { crop, pixelIndices, toRgba, withWidth } from "./decode.ts";
import { ICON_FIRST_MEMBER, ICON_FORMS, ICON_PALETTE_TABLE } from "./layout.ts";
import { readNclr, readNcgr } from "./nitro-gfx.ts";
import { spriteName } from "@soulsilver/shared/sprites";

// Icons are 32 x 32, 4 bpp. A Pokémon icon file holds two frames one above the other (the menu
// bounce); the first is the icon. Anchors are the center: icons are not placed on the map.

const ICON = 32;
const CENTER = { x: ICON >> 1, y: ICON >> 1 };

const empty = (): BattleResult => ({ frames: [], sprites: [], missing: [], failed: [] });

/** Icon index of every (species, form) that has an icon of its own. */
export function pokemonIconIndices(species: number): { species: number; form: number; index: number }[] {
  const icons = Array.from({ length: species }, (_, i) => ({ species: i + 1, form: 0, index: i + 1 }));
  for (const f of ICON_FORMS.filter((f) => f.species <= species)) {
    for (let k = 0; k < f.count; k++) icons.push({ species: f.species, form: k + 1, index: f.first + k });
  }
  return icons;
}

/**
 * `read(i)` returns member i of the icon archive, `arm9` is the decompressed ARM9 (for the
 * palette bank of each icon). Member 0 is the palette file, shared by every icon.
 */
export async function extractPokemonIcons(read: (member: number) => Promise<Uint8Array>, arm9: Uint8Array, species: number): Promise<BattleResult> {
  const result = empty();
  const palette = readNclr(await read(0));
  for (const icon of pokemonIconIndices(species)) {
    const name = spriteName("icon-pokemon", [icon.species, icon.form]);
    try {
      const bank = arm9[ICON_PALETTE_TABLE + icon.index]!;
      if (bank > 2) throw new Error(`palette bank ${bank} is out of range`);
      const gfx = withWidth(readNcgr(await read(ICON_FIRST_MEMBER + icon.index)), 4);
      const indices = pixelIndices(gfx);
      const image = toRgba(indices.subarray(0, ICON * ICON), ICON, ICON, palette.slice(bank * 16, bank * 16 + 16), name);
      result.frames.push({ name, image, anchor: CENTER });
      result.sprites.push({ name, species: icon.species, form: icon.form, frames: [name], animations: [] });
    } catch (error) {
      result.failed.push({ sprite: name, reason: (error as Error).message });
    }
  }
  return result;
}

/** Graphic and palette members of each item id, from the item map (4 u16 per item, ARM9). */
export function itemIconMembers(arm9: Uint8Array, mapOffset: number, maxId: number): { id: number; graphic: number; palette: number }[] {
  return Array.from({ length: maxId }, (_, i) => ({
    id: i + 1,
    graphic: readU16(arm9, mapOffset + (i + 1) * 8 + 2),
    palette: readU16(arm9, mapOffset + (i + 1) * 8 + 4),
  }));
}

export async function extractItemIcons(
  read: (member: number) => Promise<Uint8Array>,
  items: readonly { id: number; graphic: number; palette: number }[],
): Promise<BattleResult> {
  const result = empty();
  const palettes = new Map<number, number[]>();
  for (const item of items) {
    const name = spriteName("icon-item", [item.id]);
    try {
      let palette = palettes.get(item.palette);
      if (!palette) {
        palette = readNclr(await read(item.palette)).slice(0, 16);
        palettes.set(item.palette, palette);
      }
      const gfx = withWidth(readNcgr(await read(item.graphic)), 4);
      const image = toRgba(pixelIndices(gfx), ICON, ICON, palette, name);
      result.frames.push({ name, image: crop(image, 0, 0, ICON, ICON), anchor: CENTER });
      result.sprites.push({ name, item: item.id, frames: [name], animations: [] });
    } catch (error) {
      result.failed.push({ sprite: name, reason: (error as Error).message });
    }
  }
  return result;
}
