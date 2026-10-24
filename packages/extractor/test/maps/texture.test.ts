import { describe, expect, it } from "vitest";
import { decodeTexture, readTextureSet, TextureFormatError } from "../../src/maps/texture.ts";
import { buildTex0, type TextureSpec } from "../fixtures/maps/build-nitro.ts";

const RED = 0x001f;
const GREEN = 0x03e0;
const BLUE = 0x7c00;
const WHITE = 0x7fff;

function decode(texture: Omit<TextureSpec, "name">, colors = [RED, GREEN, BLUE, WHITE]) {
  const set = readTextureSet(buildTex0([{ name: "t", ...texture }], [{ name: "p", colors }]), 0);
  return decodeTexture(set.textures.get("t")!, set.palettes.get("p"));
}

const pixels = (data: Uint8Array, count: number) => Array.from({ length: count }, (_, i) => [...data.subarray(i * 4, i * 4 + 4)]);

describe("readTextureSet", () => {
  it("indexes textures and palettes by name, with size and format", () => {
    const tex0 = buildTex0(
      [{ name: "en_fs_a", format: 3, width: 16, height: 8, texels: new Uint8Array(64) }],
      [{ name: "en_fs_a_pl", colors: [RED] }],
    );
    const set = readTextureSet(tex0, 0);
    expect(set.textures.get("en_fs_a")).toMatchObject({ format: 3, width: 16, height: 8, color0Transparent: false });
    expect(set.palettes.has("en_fs_a_pl")).toBe(true);
  });
});

describe("decodeTexture", () => {
  it("decodes 16-color texels, low nibble first, converting BGR555 to RGB", () => {
    const texels = new Uint8Array(32);
    texels[0] = 0x21; // texel 0 = 1 (green), texel 1 = 2 (blue)
    texels[1] = 0x03; // texel 2 = 3 (white), texel 3 = 0 (red)
    const image = decode({ format: 3, width: 8, height: 8, texels });
    expect(image).toMatchObject({ width: 8, height: 8 });
    expect(pixels(image.data, 4)).toEqual([[0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255], [255, 0, 0, 255]]);
  });

  it("makes palette index 0 transparent when the texture asks for it", () => {
    const image = decode({ format: 3, width: 8, height: 8, texels: new Uint8Array(32), color0Transparent: true });
    expect(pixels(image.data, 1)).toEqual([[255, 0, 0, 0]]);
  });

  it("decodes four-color texels, two bits each, lowest first", () => {
    const texels = new Uint8Array(16);
    texels[0] = 0b11_10_01_00;
    expect(pixels(decode({ format: 2, width: 8, height: 8, texels }).data, 4).map((p) => p.slice(0, 3))).toEqual([
      [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255],
    ]);
  });

  it("decodes 256-color texels", () => {
    const texels = new Uint8Array(64);
    texels[0] = 2;
    expect(pixels(decode({ format: 4, width: 8, height: 8, texels }).data, 1)).toEqual([[0, 0, 255, 255]]);
  });

  it("scales the alpha of A3I5 and A5I3 to 8 bits", () => {
    const a3i5 = new Uint8Array(64);
    a3i5[0] = (7 << 5) | 1;
    a3i5[1] = (3 << 5) | 2;
    expect(pixels(decode({ format: 1, width: 8, height: 8, texels: a3i5 }).data, 2)).toEqual([[0, 255, 0, 255], [0, 0, 255, 109]]);
    const a5i3 = new Uint8Array(64);
    a5i3[0] = (31 << 3) | 3;
    a5i3[1] = (0 << 3) | 1;
    expect(pixels(decode({ format: 6, width: 8, height: 8, texels: a5i3 }).data, 2)).toEqual([[255, 255, 255, 255], [0, 255, 0, 0]]);
  });

  it("refuses the formats the ROM does not use", () => {
    expect(() => decode({ format: 5, width: 8, height: 8, texels: new Uint8Array(16) })).toThrow(TextureFormatError);
    expect(() => decode({ format: 7, width: 8, height: 8, texels: new Uint8Array(128) })).toThrow(TextureFormatError);
  });

  it("refuses a paletted texture without a palette", () => {
    const set = readTextureSet(buildTex0([{ name: "t", format: 3, width: 8, height: 8, texels: new Uint8Array(32) }], []), 0);
    expect(() => decodeTexture(set.textures.get("t")!, undefined)).toThrow(TextureFormatError);
  });
});
