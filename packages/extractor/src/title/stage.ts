import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NARC_INPUT, readNarcMember } from "../data/inputs.ts";
import { encodePng, type RgbaImage } from "../maps/png.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { decompressLz10 } from "../sprites/lz10.ts";
import { readNcgr, readNclr } from "../sprites/nitro-gfx.ts";
import { readNscr, renderScreen } from "./screen.ts";

// The title screen art (spec 017, US1, research R1): the SoulSilver logo and the sky gradient behind
// it, drawn from the title demo archive. The 3D Lugia of the original is not part of it.

/** The title demo archive of SoulSilver (US); found by rendering every background screen of the ROM. */
export const TITLE_ARCHIVE = "a/0/4/6";
/** Members of each layer: screen map, graphics and palette. */
export const TITLE_LAYERS = {
  logo: { screen: 0, gfx: 1, palette: 2 },
  background: { screen: 12, gfx: 11, palette: 13 },
} as const;

const unpack = (bytes: Uint8Array) => (bytes[0] === 0x10 ? decompressLz10(bytes) : bytes);

/** Every layer that could be drawn, and one line per layer that could not. */
export async function extractTitle(read: (member: number) => Promise<Uint8Array>): Promise<{ images: { name: string; image: RgbaImage }[]; problems: string[] }> {
  const images: { name: string; image: RgbaImage }[] = [];
  const problems: string[] = [];
  for (const [name, layer] of Object.entries(TITLE_LAYERS)) {
    try {
      const image = renderScreen(readNcgr(unpack(await read(layer.gfx))), readNclr(unpack(await read(layer.palette))), readNscr(unpack(await read(layer.screen))));
      images.push({ name, image });
    } catch (error) {
      problems.push(`${name}: ${(error as Error).message}`);
    }
  }
  return { images, problems };
}

async function run(ctx: StageContext): Promise<void> {
  const out = ctx.outputDir("title");
  const { images, problems } = await extractTitle((m) => readNarcMember(ctx, TITLE_ARCHIVE, m));
  // The title screen falls back to plain text, so a missing layer never fails the extraction.
  for (const p of problems) ctx.log.warn(`title: ${p}`);
  for (const { name, image } of images) await writeFile(join(out, `${name}.png`), encodePng(image));
  ctx.progress(1);
}

export const titleStage: Stage = {
  id: "title",
  title: "Extraindo a tela de título",
  version: 1,
  weight: 1,
  inputs: [NARC_INPUT],
  outputs: ["title"],
  estimateBytes: () => 1024 * 1024,
  run,
};
