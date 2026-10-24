import { describe, expect, it } from "vitest";
import { extractBattle } from "../../src/sprites/battle.ts";
import { bgr555, buildNclr, buildNcgr, encryptPokemonPixels } from "../fixtures/sprites/builders.ts";

// A graphic is 2 frames side by side: 16 x 8 pixels (2 x 1 tiles), 4 bpp, scanned.
// Frame 0 is the left 8 x 8; every pixel uses `color`. The first word is the seed (color 0).
function graphic(color: number): Uint8Array {
  const plain = new Uint8Array(64).fill(color | (color << 4));
  plain[0] = plain[1] = 0;
  return buildNcgr({ tilesWide: 2, tilesHigh: 1, scanned: true, data: encryptPokemonPixels(plain) });
}

const normal = buildNclr([0, bgr555(31, 0, 0), bgr555(0, 31, 0)]);
const shiny = buildNclr([0, bgr555(0, 0, 31), bgr555(0, 31, 0)]);
const empty = new Uint8Array(0);

/** members = [female back, male back, female front, male front] per species, then palettes. */
function archive(species: Uint8Array[][]) {
  const members = [[empty, empty, empty, empty, empty, empty], ...species.map((g) => [...g, normal, shiny])].flat();
  return (index: number) => Promise.resolve(members[index] ?? empty);
}

describe("extractBattle", () => {
  it("makes one unisex sprite when both genders are identical", async () => {
    const g = graphic(1);
    const r = await extractBattle(archive([[g, g, g, g]]), 1);
    expect(r.failed).toEqual([]);
    expect(r.sprites.map((s) => [s.name, s.gender, s.frames])).toEqual([["battle/1/0/unisex", "unisex", ["battle/1/0/front/unisex", "battle/1/0/back/unisex"]]]);
    expect(r.frames).toHaveLength(2);
  });

  it("makes a female and a male sprite when the graphics differ", async () => {
    const r = await extractBattle(archive([[graphic(1), graphic(2), graphic(1), graphic(2)]]), 1);
    expect(r.sprites.map((s) => s.gender)).toEqual(["female", "male"]);
    expect(r.frames).toHaveLength(4);
  });

  it("uses the only gender that has a graphic", async () => {
    const g = graphic(1);
    const r = await extractBattle(archive([[empty, g, empty, g]]), 1);
    expect(r.sprites.map((s) => s.gender)).toEqual(["unisex"]);
  });

  it("applies the shiny palette to the same pixels, keeping the transparent color", async () => {
    const r = await extractBattle(archive([[graphic(1), graphic(1), graphic(1), graphic(1)]]), 1);
    const front = r.frames.find((f) => f.name === "battle/1/0/front/unisex")!;
    // The first word (4 pixels) is color 0 (transparent); the others are color 1.
    expect([...front.image.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...front.image.data.subarray(16, 20)]).toEqual([255, 0, 0, 255]);
    expect([...front.shiny!.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...front.shiny!.data.subarray(16, 20)]).toEqual([0, 0, 255, 255]);
    expect(front.image.width).toBe(8);
    expect(front.anchor).toEqual({ x: 4, y: 8 });
  });

  it("reports a species without any graphic and keeps going", async () => {
    const g = graphic(1);
    const r = await extractBattle(archive([[empty, empty, empty, empty], [g, g, g, g]]), 2);
    expect(r.failed).toEqual([{ sprite: "battle/1/0", reason: "no graphic in any gender" }]);
    expect(r.sprites.map((s) => s.species)).toEqual([2]);
  });

  it("reports a palette that is too short, naming the sprite", async () => {
    const short = buildNclr([0]);
    const members = [[empty, empty, empty, empty, empty, empty], [graphic(1), graphic(1), graphic(1), graphic(1), short, short]].flat();
    const r = await extractBattle((i: number) => Promise.resolve(members[i] ?? empty), 1);
    expect(r.failed[0]!.sprite).toBe("battle/1/0");
    expect(r.failed[0]!.reason).toContain("battle/1/0/");
  });

  it("lists a missing shiny palette", async () => {
    const g = graphic(1);
    const members = [[empty, empty, empty, empty, empty, empty], [g, g, g, g, normal, empty]].flat();
    const r = await extractBattle((i: number) => Promise.resolve(members[i] ?? empty), 1);
    expect(r.missing).toEqual([{ sprite: "battle/1/0", reason: "shiny palette is missing" }]);
    expect(r.frames[0]!.shiny).toBeUndefined();
  });
});
