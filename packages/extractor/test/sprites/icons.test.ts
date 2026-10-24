import { describe, expect, it } from "vitest";
import { ICON_PALETTE_TABLE } from "../../src/sprites/layout.ts";
import { extractItemIcons, extractPokemonIcons, itemIconMembers, pokemonIconIndices } from "../../src/sprites/icons.ts";
import { extractTrainers } from "../../src/sprites/trainers.ts";
import { bgr555, buildNclr, buildNcgr, encryptTrainerPixels } from "../fixtures/sprites/builders.ts";

const five = (c: number) => (c << 3) | (c >> 2);

// Palette: bank 0 colors 1 and 2 are red 1 and 2; bank 1 colors are blue 1 and 2.
const iconPalette = buildNclr([0, bgr555(1, 0, 0), bgr555(2, 0, 0), ...new Array<number>(13).fill(0), 0, bgr555(0, 0, 1), bgr555(0, 0, 2), ...new Array<number>(13).fill(0)]);

/** 32 x 64 icon (two frames, 4 tiles wide); the first frame is color 1, the second color 2. */
const icon = buildNcgr({ tilesWide: 4, tilesHigh: 8, data: [...new Array<number>(512).fill(0x11), ...new Array<number>(512).fill(0x22)] });

describe("pokemonIconIndices", () => {
  it("is the species number, plus Deoxys and Unown forms from their own icons", () => {
    const all = pokemonIconIndices(493);
    expect(all).toHaveLength(493 + 3 + 27);
    expect(all[0]).toEqual({ species: 1, form: 0, index: 1 });
    expect(all.find((i) => i.species === 386 && i.form === 3)!.index).toBe(498);
    expect(all.find((i) => i.species === 201 && i.form === 27)!.index).toBe(526);
  });

  it("leaves out forms of species beyond the requested count", () => {
    expect(pokemonIconIndices(2)).toHaveLength(2);
  });
});

describe("extractPokemonIcons", () => {
  const arm9 = new Uint8Array(ICON_PALETTE_TABLE + 8);
  arm9[ICON_PALETTE_TABLE + 1] = 0;
  arm9[ICON_PALETTE_TABLE + 2] = 1;
  const read = (member: number) => Promise.resolve(member === 0 ? iconPalette : icon);

  it("uses the first frame and the palette bank of each icon", async () => {
    const r = await extractPokemonIcons(read, arm9, 2);
    expect(r.failed).toEqual([]);
    expect(r.sprites.map((s) => s.name)).toEqual(["icon-pokemon/1/0", "icon-pokemon/2/0"]);
    const first = r.frames[0]!.image;
    expect([first.width, first.height]).toEqual([32, 32]);
    expect([...first.data.subarray(0, 4)]).toEqual([five(1), 0, 0, 255]); // bank 0, color 1
    expect([...r.frames[1]!.image.data.subarray(0, 4)]).toEqual([0, 0, five(1), 255]); // bank 1, color 1
  });

  it("reports a palette bank out of range, naming the icon", async () => {
    arm9[ICON_PALETTE_TABLE + 2] = 3;
    const r = await extractPokemonIcons(read, arm9, 2);
    expect(r.failed.map((f) => f.sprite)).toEqual(["icon-pokemon/2/0"]);
    expect(r.failed[0]!.reason).toContain("bank 3");
  });
});

describe("items", () => {
  it("reads graphic and palette members from the item map", () => {
    const arm9 = new Uint8Array(8 * 3);
    const view = new DataView(arm9.buffer);
    [[1, 1, 7, 8], [2, 2, 9, 10]].forEach(([id, data, gfx, pal]) => {
      view.setUint16(id! * 8, data!, true);
      view.setUint16(id! * 8 + 2, gfx!, true);
      view.setUint16(id! * 8 + 4, pal!, true);
    });
    expect(itemIconMembers(arm9, 0, 2)).toEqual([{ id: 1, graphic: 7, palette: 8 }, { id: 2, graphic: 9, palette: 10 }]);
  });

  it("decodes 32 x 32 icons, keeping the first 16 colors of the palette", async () => {
    const gfx = buildNcgr({ tilesWide: 4, tilesHigh: 4, data: new Array(512).fill(0x11) });
    const files = new Map([[5, gfx], [6, iconPalette]]);
    const r = await extractItemIcons((m) => Promise.resolve(files.get(m)!), [{ id: 1, graphic: 5, palette: 6 }, { id: 2, graphic: 5, palette: 6 }, { id: 3, graphic: 99, palette: 6 }]);
    expect(r.sprites.map((s) => [s.name, s.item])).toEqual([["icon-item/1", 1], ["icon-item/2", 2]]);
    expect([...r.frames[0]!.image.data.subarray(0, 4)]).toEqual([five(1), 0, 0, 255]);
    expect(r.failed.map((f) => f.sprite)).toEqual(["icon-item/3"]);
  });
});

describe("extractTrainers", () => {
  // Sheet of 20 x 10 tiles (160 x 80), scanned: every pixel color 1 except the last word (0).
  const plain = new Uint8Array(6400).fill(0x11);
  plain[6398] = plain[6399] = 0;
  const sheet = buildNcgr({ tilesWide: 20, tilesHigh: 10, scanned: true, data: encryptTrainerPixels(plain) });
  const group = [new Uint8Array(0), buildNclr([0, bgr555(1, 0, 0)]), new Uint8Array(0), new Uint8Array(0), sheet];
  const members = [...group, ...group];
  const read = (i: number) => Promise.resolve(members[i] ?? new Uint8Array(0));

  it("crops the left 80 x 80 half and anchors on the feet", async () => {
    const r = await extractTrainers(read, 2);
    expect(r.failed).toEqual([]);
    expect(r.sprites.map((s) => [s.name, s.trainer])).toEqual([["trainer/0", 0], ["trainer/1", 1]]);
    const image = r.frames[0]!.image;
    expect([image.width, image.height]).toEqual([80, 80]);
    expect([...image.data.subarray(0, 4)]).toEqual([five(1), 0, 0, 255]);
    expect(r.frames[0]!.anchor).toEqual({ x: 40, y: 80 });
  });

  it("reports a trainer without graphics, naming it, and keeps the rest", async () => {
    const r = await extractTrainers(read, 3);
    expect(r.failed.map((f) => f.sprite)).toEqual(["trainer/2"]);
    expect(r.sprites).toHaveLength(2);
  });
});
