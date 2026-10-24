import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ATLAS_MAX_SIZE,
  parseSpriteFile,
  serializeSpriteFile,
  SPRITE_FORMAT_VERSION,
  type SpriteCategory,
  type SpriteEntry,
  type SpriteSetFile,
} from "@soulsilver/shared/sprites";
import { encodePng, type RgbaImage } from "../maps/png.ts";
import { packFrames } from "./pack.ts";

export interface FrameInput {
  name: string;
  image: RgbaImage;
  /** Same pixels with the shiny palette; must have the same size as `image`. */
  shiny?: RgbaImage;
  anchor: { x: number; y: number };
}

export interface Atlas {
  set: SpriteSetFile;
  /** File name -> PNG bytes. */
  files: Map<string, Uint8Array>;
}

function blit(page: RgbaImage, image: RgbaImage, x: number, y: number): void {
  for (let row = 0; row < image.height; row++) {
    page.data.set(image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4), ((y + row) * page.width + x) * 4);
  }
}

/** Packs frames into pages (normal and, when any frame has it, shiny) and builds the set. */
export function buildAtlas(category: SpriteCategory, frames: readonly FrameInput[], sprites: readonly SpriteEntry[]): Atlas {
  const packed = packFrames(frames.map((f) => ({ name: f.name, w: f.image.width, h: f.image.height })), ATLAS_MAX_SIZE);
  const hasShiny = frames.some((f) => f.shiny);
  for (const f of frames) {
    if (f.shiny && (f.shiny.width !== f.image.width || f.shiny.height !== f.image.height)) {
      throw new Error(`Frame ${f.name}: the shiny image must have the same size as the normal one`);
    }
  }
  const files = new Map<string, Uint8Array>();
  const pages = packed.pages.map((size, index) => {
    const file = `${category}-${index}.png`;
    const shinyFile = hasShiny ? `${category}-${index}-shiny.png` : undefined;
    const normal: RgbaImage = { ...size, data: new Uint8Array(size.width * size.height * 4) };
    const shiny: RgbaImage = { ...size, data: new Uint8Array(size.width * size.height * 4) };
    for (const f of frames) {
      const at = packed.placements.get(f.name)!;
      if (at.page !== index) continue;
      blit(normal, f.image, at.x, at.y);
      blit(shiny, f.shiny ?? f.image, at.x, at.y);
    }
    files.set(file, encodePng(normal));
    if (shinyFile) files.set(shinyFile, encodePng(shiny));
    return { file, ...(shinyFile ? { shinyFile } : {}), ...size };
  });
  const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const set: SpriteSetFile = {
    kind: "sprite-set",
    formatVersion: SPRITE_FORMAT_VERSION,
    category,
    pages,
    frames: frames
      .map((f) => {
        const at = packed.placements.get(f.name)!;
        return { name: f.name, page: at.page, x: at.x, y: at.y, w: f.image.width, h: f.image.height, anchor: f.anchor };
      })
      .sort(byName),
    sprites: [...sprites].sort(byName),
  };
  return { set, files };
}

/** Validates the set before writing anything (FR-013) and writes pages and JSON. */
export async function writeAtlas(dir: string, atlas: Atlas): Promise<void> {
  const file = `${atlas.set.category}.json`;
  const checked = parseSpriteFile("sprite-set", atlas.set, file);
  if (!checked.ok) throw new Error(`${checked.error.file}: ${checked.error.path}: ${checked.error.problem}`);
  await mkdir(dir, { recursive: true });
  for (const [name, bytes] of atlas.files) await writeFile(join(dir, name), bytes);
  await writeFile(join(dir, file), serializeSpriteFile("sprite-set", checked.data));
}
