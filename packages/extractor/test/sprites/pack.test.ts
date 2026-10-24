import { parseSpriteFile } from "@soulsilver/shared/sprites";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packFrames } from "../../src/sprites/pack.ts";
import { buildAtlas, writeAtlas } from "../../src/sprites/writer.ts";
import type { RgbaImage } from "../../src/maps/png.ts";

const solid = (w: number, h: number, rgba: [number, number, number, number]): RgbaImage => ({
  width: w,
  height: h,
  data: new Uint8Array(w * h * 4).map((_, i) => rgba[i % 4]!),
});

describe("packFrames", () => {
  it("packs without overlap, tallest first, and trims the page", () => {
    const { pages, placements } = packFrames(
      [
        { name: "b", w: 4, h: 2 },
        { name: "a", w: 4, h: 4 },
        { name: "c", w: 4, h: 4 },
      ],
      8,
    );
    expect(placements.get("a")).toEqual({ page: 0, x: 0, y: 0 });
    expect(placements.get("c")).toEqual({ page: 0, x: 4, y: 0 });
    expect(placements.get("b")).toEqual({ page: 0, x: 0, y: 4 });
    expect(pages).toEqual([{ width: 8, height: 6 }]);
  });

  it("opens a new page when the first is full", () => {
    const { pages, placements } = packFrames([{ name: "a", w: 8, h: 8 }, { name: "b", w: 8, h: 8 }], 8);
    expect(pages).toHaveLength(2);
    expect(placements.get("b")!.page).toBe(1);
  });

  it("is independent of the input order", () => {
    const items = [{ name: "x", w: 3, h: 3 }, { name: "y", w: 3, h: 3 }, { name: "z", w: 2, h: 5 }];
    expect([...packFrames(items, 8).placements]).toEqual([...packFrames([...items].reverse(), 8).placements]);
  });

  it("rejects a frame larger than the page", () => {
    expect(() => packFrames([{ name: "big", w: 9, h: 1 }], 8)).toThrow("big");
  });
});

describe("buildAtlas / writeAtlas", () => {
  const red = solid(2, 2, [255, 0, 0, 255]);
  const blue = solid(2, 2, [0, 0, 255, 255]);
  const frames = [{ name: "battle/1/0/front", image: red, shiny: blue, anchor: { x: 1, y: 2 } }];
  const sprites = [{ name: "battle/1/0", species: 1, form: 0, frames: ["battle/1/0/front"], animations: [] }];

  it("builds a valid set with the same rectangles for normal and shiny", () => {
    const atlas = buildAtlas("battle", frames, sprites);
    expect(parseSpriteFile("sprite-set", atlas.set, "battle.json").ok).toBe(true);
    expect(atlas.set.pages[0]).toMatchObject({ file: "battle-0.png", shinyFile: "battle-0-shiny.png" });
    expect([...atlas.files.keys()]).toEqual(["battle-0.png", "battle-0-shiny.png"]);
  });

  it("gives identical bytes on two builds", () => {
    const a = buildAtlas("battle", frames, sprites);
    const b = buildAtlas("battle", frames, sprites);
    expect(a.files.get("battle-0.png")).toEqual(b.files.get("battle-0.png"));
  });

  it("has no shiny page when no frame has a shiny image", () => {
    const atlas = buildAtlas("icon-item", [{ name: "icon-item/1", image: red, anchor: { x: 0, y: 0 } }], []);
    expect(atlas.set.pages[0]!.shinyFile).toBeUndefined();
  });

  it("rejects a shiny image of another size", () => {
    expect(() => buildAtlas("battle", [{ ...frames[0]!, shiny: solid(3, 2, [0, 0, 0, 255]) }], sprites)).toThrow("same size");
  });

  it("refuses to write an invalid set, naming file and path", async () => {
    const atlas = buildAtlas("battle", frames, [{ name: "s", frames: ["missing"], animations: [] }]);
    const dir = await mkdtemp(join(tmpdir(), "atlas-"));
    try {
      await expect(writeAtlas(dir, atlas)).rejects.toThrow("battle.json: sprites.0.frames.0");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("writes pages and the json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-"));
    try {
      await writeAtlas(dir, buildAtlas("battle", frames, sprites));
      expect((await readFile(join(dir, "battle.json"), "utf8")).endsWith("\n")).toBe(true);
      expect((await readFile(join(dir, "battle-0.png"))).subarray(1, 4).toString()).toBe("PNG");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
