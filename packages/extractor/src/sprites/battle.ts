import { spriteName, type SpriteEntry } from "@soulsilver/shared/sprites";
import type { RgbaImage } from "../maps/png.ts";
import { crop, pixelIndices, toRgba } from "./decode.ts";
import { decryptPokemonPixels, readNclr, readNcgr } from "./nitro-gfx.ts";
import type { FrameInput } from "./writer.ts";

// Battle sprites of the base forms: six members per species in the pokegra archive
// (research.md R0): 0 female back, 1 male back, 2 female front, 3 male front, 4 normal
// palette, 5 shiny palette. A zero-length member means the gender has no graphic of its own.

export interface Failure {
  sprite: string;
  reason: string;
}

export interface BattleResult {
  frames: FrameInput[];
  sprites: SpriteEntry[];
  missing: { sprite: string; frame?: string; reason: string }[];
  failed: Failure[];
}

const MEMBERS_PER_SPECIES = 6;
const VIEWS = ["front", "back"] as const;
type View = (typeof VIEWS)[number];
const GENDERS = ["female", "male"] as const;
const MEMBER: Record<View, Record<(typeof GENDERS)[number], number>> = {
  front: { female: 2, male: 3 },
  back: { female: 0, male: 1 },
};

export interface Pixels {
  indices: Uint8Array;
  width: number;
  height: number;
}

/** The graphic holds two animation frames side by side; the first one is the sprite. */
export function firstFrame(gfx: Uint8Array): Pixels {
  const ncgr = readNcgr(gfx);
  const width = ncgr.tilesWide * 8;
  const height = ncgr.tilesHigh * 8;
  const indices = pixelIndices(ncgr, decryptPokemonPixels(ncgr.data));
  const half = width / 2;
  const out = new Uint8Array(half * height);
  for (let y = 0; y < height; y++) out.set(indices.subarray(y * width, y * width + half), y * half);
  return { indices: out, width: half, height };
}

const same = (a: Pixels, b: Pixels) => a.width === b.width && a.indices.every((v, i) => v === b.indices[i]);

/** `read(i)` returns member i of the pokegra archive; species `n` is group `n`. */
export async function extractBattle(read: (index: number) => Promise<Uint8Array>, species: number): Promise<BattleResult> {
  const result: BattleResult = { frames: [], sprites: [], missing: [], failed: [] };
  for (let s = 1; s <= species; s++) {
    const label = spriteName("battle", [s, 0]);
    try {
      const base = s * MEMBERS_PER_SPECIES;
      const members = await Promise.all(Array.from({ length: MEMBERS_PER_SPECIES }, (_, k) => read(base + k)));
      const normal = readNclr(members[4]!);
      const shinyBytes = members[5]!;
      if (shinyBytes.length === 0) result.missing.push({ sprite: label, reason: "shiny palette is missing" });
      const shiny = shinyBytes.length ? readNclr(shinyBytes) : undefined;

      const pixels = {} as Record<View, Partial<Record<(typeof GENDERS)[number], Pixels>>>;
      for (const view of VIEWS) {
        pixels[view] = {};
        for (const gender of GENDERS) {
          const bytes = members[MEMBER[view][gender]]!;
          if (bytes.length) pixels[view][gender] = firstFrame(bytes);
        }
      }
      const have = (g: (typeof GENDERS)[number]) => VIEWS.every((v) => pixels[v][g]);
      if (!have("female") && !have("male")) {
        result.failed.push({ sprite: label, reason: "no graphic in any gender" });
        continue;
      }
      const identical =
        have("female") && have("male") && VIEWS.every((v) => same(pixels[v].female!, pixels[v].male!));
      // One graphic only, or two identical ones: a single unisex sprite.
      const slots: { gender: SpriteEntry["gender"]; source: (typeof GENDERS)[number] }[] =
        identical || !have("female") || !have("male")
          ? [{ gender: "unisex", source: have("male") ? "male" : "female" }]
          : [
              { gender: "female", source: "female" },
              { gender: "male", source: "male" },
            ];

      for (const slot of slots) {
        const names: string[] = [];
        for (const view of VIEWS) {
          const px = pixels[view][slot.source]!;
          const name = spriteName("battle", [s, 0, view, slot.gender!]);
          const image: RgbaImage = toRgba(px.indices, px.width, px.height, normal, name);
          const shinyImage = shiny ? toRgba(px.indices, px.width, px.height, shiny, name) : undefined;
          result.frames.push({ name, image: crop(image, 0, 0, px.width, px.height), ...(shinyImage ? { shiny: shinyImage } : {}), anchor: { x: px.width >> 1, y: px.height } });
          names.push(name);
        }
        result.sprites.push({ name: spriteName("battle", [s, 0, slot.gender!]), species: s, form: 0, gender: slot.gender!, frames: names, animations: [] });
      }
    } catch (error) {
      result.failed.push({ sprite: label, reason: (error as Error).message });
    }
  }
  return result;
}
