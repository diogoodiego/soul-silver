import { describe, expect, it } from "vitest";
import { readU32 } from "../../src/binary.ts";
import { NdsFormatError } from "../../src/nds/header.ts";
import { readNdsFileSystem } from "../../src/nds/filesystem.ts";
import { buildNdsRom } from "../fixtures/build-nds-rom.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("readNdsFileSystem", () => {
  it("round-trips nested paths and contents", () => {
    const files = {
      "a/0/0/0": bytes(1, 2, 3),
      "a/0/0/1": bytes(4),
      "data/mapname.bin": bytes(5, 6),
      "root.txt": bytes(),
    };
    const rom = buildNdsRom({ files });
    const fs = readNdsFileSystem(rom);
    expect(fs.files.map((f) => f.path).sort()).toEqual(Object.keys(files).sort());
    for (const file of fs.files) {
      expect(rom.subarray(file.start, file.end)).toEqual(files[file.path as keyof typeof files]);
    }
  });

  it("resolves overlays through their FAT file ids", () => {
    const overlays9 = [bytes(9, 9), bytes(8)];
    const overlays7 = [bytes(7, 7, 7)];
    const rom = buildNdsRom({ overlays9, overlays7 });
    const fs = readNdsFileSystem(rom);
    expect(fs.overlays9.map((o) => rom.subarray(o.start, o.end))).toEqual(overlays9);
    expect(fs.overlays7.map((o) => rom.subarray(o.start, o.end))).toEqual(overlays7);
    expect(fs.overlays9.map((o) => o.fileId)).toEqual([0, 1]);
    expect(fs.overlays7.map((o) => o.fileId)).toEqual([2]);
    expect(fs.files.every((f) => f.id >= 3)).toBe(true);
  });

  it("rejects a FAT entry that ends before it starts", () => {
    const rom = buildNdsRom();
    const fat = readU32(rom, 0x48);
    const view = new DataView(rom.buffer);
    view.setUint32(fat + 4, view.getUint32(fat, true) - 1, true);
    expect(() => readNdsFileSystem(rom)).toThrow(NdsFormatError);
  });

  it("rejects a FAT entry beyond the ROM", () => {
    const rom = buildNdsRom();
    new DataView(rom.buffer).setUint32(readU32(rom, 0x48) + 4, rom.length + 1, true);
    expect(() => readNdsFileSystem(rom)).toThrow(/FAT/);
  });

  it("rejects the reserved subtable entry type 0x80", () => {
    const rom = buildNdsRom({ files: { "x.bin": bytes(1) } });
    const fnt = readU32(rom, 0x40);
    const rootSubtable = fnt + readU32(rom, fnt);
    rom[rootSubtable] = 0x80;
    expect(() => readNdsFileSystem(rom)).toThrow(NdsFormatError);
  });
});
