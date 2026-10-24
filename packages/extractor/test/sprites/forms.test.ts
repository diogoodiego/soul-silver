import { describe, expect, it } from "vitest";
import { extractForms } from "../../src/sprites/forms.ts";
import { FORM_GRAPHICS, FORM_GROUPS } from "../../src/sprites/layout.ts";
import { bgr555, buildNclr, buildNcgr, encryptPokemonPixels } from "../fixtures/sprites/builders.ts";

const plain = new Uint8Array(64).fill(0x11);
plain[0] = plain[1] = 0;
const graphic = buildNcgr({ tilesWide: 2, tilesHigh: 1, scanned: true, data: encryptPokemonPixels(plain) });

/** Palette pair k: normal has color 1 = (k, 0, 0) in red, shiny has it in blue. */
const pair = (k: number) => [buildNclr([0, bgr555(k, 0, 0)]), buildNclr([0, bgr555(0, 0, k)])];
const pairs = FORM_GROUPS.reduce((n, g) => Math.max(n, g.pal + (g.shared ? 1 : g.forms)), 0);
const members = [
  ...Array.from({ length: FORM_GRAPHICS }, () => graphic),
  ...Array.from({ length: pairs }, (_, k) => pair(k + 1)).flat(),
];
const read = (i: number) => Promise.resolve(members[i]!);

describe("extractForms", () => {
  it("covers the 79 form pairs and 49 palette pairs of the archive", () => {
    expect(FORM_GROUPS.reduce((n, g) => n + g.forms, 0)).toBe(79);
    expect(pairs).toBe(49);
  });

  it("makes one unisex sprite per form 1 and up, skipping the egg", async () => {
    const r = await extractForms(read);
    expect(r.failed).toEqual([]);
    expect(r.sprites).toHaveLength(65);
    expect(r.sprites.find((s) => s.name === "battle/386/3/unisex")).toMatchObject({ species: 386, form: 3, gender: "unisex" });
    expect(r.sprites.some((s) => s.form === 0 || s.species === 0)).toBe(false);
    expect(r.sprites.filter((s) => s.species === 201)).toHaveLength(27);
  });

  it("gives front first and back second", async () => {
    const r = await extractForms(read);
    expect(r.sprites.find((s) => s.name === "battle/172/1/unisex")!.frames).toEqual(["battle/172/1/front/unisex", "battle/172/1/back/unisex"]);
  });

  it("shares one palette pair in Deoxys and Unown, one pair per form elsewhere", async () => {
    const r = await extractForms(read);
    const red = (name: string) => r.frames.find((f) => f.name === name)!.image.data[16]!;
    const blue = (name: string) => r.frames.find((f) => f.name === name)!.shiny!.data[18]!;
    expect(red("battle/386/3/front/unisex")).toBe(255 * 0 + (1 << 3 | 1 >> 2));
    expect(red("battle/201/27/front/unisex")).toBe(red("battle/201/1/front/unisex"));
    expect(red("battle/351/2/front/unisex")).not.toBe(red("battle/351/1/front/unisex"));
    expect(blue("battle/493/17/front/unisex")).toBeGreaterThan(0);
  });

  it("reports a form whose palette is missing, naming it", async () => {
    const broken = (i: number) => (i === FORM_GRAPHICS ? Promise.resolve(buildNclr([0])) : read(i));
    const r = await extractForms(broken);
    expect(r.failed.map((f) => f.sprite)).toEqual(["battle/386/1", "battle/386/2", "battle/386/3"]);
  });
});
