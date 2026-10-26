import { describe, expect, it } from "vitest";
import { readNcgr } from "../../src/sprites/nitro-gfx.ts";
import { readNscr, renderScreen } from "../../src/title/screen.ts";
import { extractTitle, TITLE_LAYERS } from "../../src/title/stage.ts";
import { bgr555, buildLz10, buildNclr, buildNcgr } from "../fixtures/sprites/builders.ts";

// Spec 017, US1: the title art, from synthetic NSCR/NCGR/NCLR (principle II).

function buildNscr(width: number, height: number, cells: number[]): Uint8Array {
  const out = new Uint8Array(0x24 + cells.length * 2);
  const v = new DataView(out.buffer);
  out.set([..."RCSN"].map((c) => c.charCodeAt(0)), 0);
  v.setUint32(8, out.length, true);
  out.set([..."NRCS"].map((c) => c.charCodeAt(0)), 0x10);
  v.setUint16(0x18, width, true);
  v.setUint16(0x1a, height, true);
  v.setUint32(0x20, cells.length * 2, true);
  cells.forEach((c, i) => v.setUint16(0x24 + i * 2, c, true));
  return out;
}

const RED = bgr555(31, 0, 0);
const GREEN = bgr555(0, 31, 0);
/** Palette bank 0 has red at 1, bank 1 has green at 1. */
const palette = [0, RED, ...Array<number>(14).fill(0), 0, GREEN];
/** Tile 0: transparent. Tile 1: color 1 in its top-left pixel only. */
const tiles = buildNcgr({ tilesWide: 2, tilesHigh: 1, data: [...Array<number>(32).fill(0), 0x01, ...Array<number>(31).fill(0)] });
const rgb = (img: { width: number; data: Uint8Array }, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe("renderScreen", () => {
  it("draws each cell's tile with its palette bank and leaves index 0 transparent", () => {
    const img = renderScreen(readNcgr(tiles), palette, readNscr(buildNscr(16, 8, [1, 1 | (1 << 12)])));
    expect(rgb(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(rgb(img, 8, 0)).toEqual([0, 255, 0, 255]);
    expect(rgb(img, 1, 0)[3]).toBe(0);
  });

  it("flips tiles horizontally and vertically", () => {
    const img = renderScreen(readNcgr(tiles), palette, readNscr(buildNscr(8, 8, [1 | 0x400 | 0x800])));
    expect(rgb(img, 7, 7)).toEqual([255, 0, 0, 255]);
    expect(rgb(img, 0, 0)[3]).toBe(0);
  });

  it("rejects a file that is not an NSCR", () => {
    expect(() => readNscr(buildNclr([0]))).toThrow("RCSN");
  });
});

describe("extractTitle", () => {
  const members = (compress: boolean) => {
    const files = new Map<number, Uint8Array>();
    for (const layer of Object.values(TITLE_LAYERS)) {
      files.set(layer.screen, compress ? buildLz10(buildNscr(8, 8, [1])) : buildNscr(8, 8, [1]));
      files.set(layer.gfx, compress ? buildLz10(tiles) : tiles);
      files.set(layer.palette, buildNclr(palette));
    }
    return files;
  };

  it("renders every layer, LZ10-compressed or not", async () => {
    for (const compress of [false, true]) {
      const files = members(compress);
      const { images, problems } = await extractTitle((i) => Promise.resolve(files.get(i)!));
      expect(problems).toEqual([]);
      expect(images.map((i) => i.name).sort()).toEqual(Object.keys(TITLE_LAYERS).sort());
      expect(rgb(images[0]!.image, 0, 0)).toEqual([255, 0, 0, 255]);
    }
  });

  it("reports a missing or broken layer and keeps the others", async () => {
    const files = members(false);
    files.delete(TITLE_LAYERS.background.gfx);
    const { images, problems } = await extractTitle((i) => {
      const f = files.get(i);
      return f ? Promise.resolve(f) : Promise.reject(new Error(`no member ${i}`));
    });
    expect(images.map((i) => i.name)).toEqual(["logo"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("background");
  });
});
