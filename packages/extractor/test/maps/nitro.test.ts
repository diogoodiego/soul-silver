import { describe, expect, it } from "vitest";
import { NitroFormatError, readDictionary, readNitroBlocks } from "../../src/maps/nitro.ts";
import { buildBlock, buildDictionary, buildNitroFile, u32Bytes } from "../fixtures/maps/build-nitro.ts";

describe("readNitroBlocks", () => {
  it("finds each block by magic", () => {
    const mdl = buildBlock("MDL0", new Uint8Array(4));
    const tex = buildBlock("TEX0", new Uint8Array(8));
    const file = buildNitroFile("BMD0", [mdl, tex]);
    const blocks = readNitroBlocks(file, "BMD0");
    expect(blocks.get("MDL0")).toBe(24);
    expect(blocks.get("TEX0")).toBe(24 + mdl.length);
  });

  it("refuses another magic", () => {
    expect(() => readNitroBlocks(buildNitroFile("BTX0", []), "BMD0")).toThrow(NitroFormatError);
  });
});

describe("readDictionary", () => {
  it("returns names and entry data, in order", () => {
    const dict = buildDictionary(
      [
        { name: "en_fs_a", data: u32Bytes(0x10) },
        { name: "h_kage", data: u32Bytes(0x20) },
      ],
      4,
    );
    const bytes = new Uint8Array(8 + dict.length);
    bytes.set(dict, 8);
    const entries = readDictionary(bytes, 8);
    expect(entries.map((e) => e.name)).toEqual(["en_fs_a", "h_kage"]);
    expect(entries.map((e) => [...e.data])).toEqual([[0x10, 0, 0, 0], [0x20, 0, 0, 0]]);
  });

  it("keeps a full 16-character name", () => {
    const entries = readDictionary(buildDictionary([{ name: "abcdefghijklmnop", data: u32Bytes(0) }], 4), 0);
    expect(entries[0]!.name).toBe("abcdefghijklmnop");
  });

  it("refuses a dictionary that runs past the file", () => {
    const dict = buildDictionary([{ name: "x", data: u32Bytes(0) }], 4);
    expect(() => readDictionary(dict.subarray(0, dict.length - 4), 0)).toThrow(RangeError);
  });
});
