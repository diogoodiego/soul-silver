import { describe, expect, it } from "vitest";
import { readU32 } from "../../src/binary.ts";
import { NdsFormatError, parseNdsHeader } from "../../src/nds/header.ts";
import { crc16 } from "../../src/rom/crc16.ts";
import { BANNER_SIZE, buildNdsRom, corruptByte } from "../fixtures/build-nds-rom.ts";

/** Sets a u32 header field and fixes the header CRC, so only bounds are wrong. */
function withField(rom: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = rom.slice();
  new DataView(copy.buffer).setUint32(offset, value, true);
  const crc = crc16(copy, 0, 0x15e);
  copy[0x15e] = crc & 0xff;
  copy[0x15f] = crc >>> 8;
  return copy;
}

describe("parseNdsHeader", () => {
  it("reads title, game code and section locations", () => {
    const arm9 = new Uint8Array(40);
    const rom = buildNdsRom({ title: "POKEMON SS", gameCode: "IPGE", arm9 });
    const header = parseNdsHeader(rom);
    expect(header.title).toBe("POKEMON SS");
    expect(header.gameCode).toBe("IPGE");
    expect(header.arm9).toEqual({ offset: readU32(rom, 0x20), size: 40 });
    expect(header.arm7.offset).toBe(readU32(rom, 0x30));
    expect(header.fnt).toEqual({ offset: readU32(rom, 0x40), size: readU32(rom, 0x44) });
    expect(header.fat).toEqual({ offset: readU32(rom, 0x48), size: readU32(rom, 0x4c) });
    expect(header.y9).toEqual({ offset: readU32(rom, 0x50), size: 32 });
    expect(header.y7).toEqual({ offset: readU32(rom, 0x58), size: 32 });
    expect(header.banner).toEqual({ offset: readU32(rom, 0x68), size: BANNER_SIZE });
  });

  it("rejects a wrong header CRC", () => {
    expect(() => parseNdsHeader(corruptByte(buildNdsRom(), 0x15e))).toThrow(NdsFormatError);
    expect(() => parseNdsHeader(corruptByte(buildNdsRom(), 0x20))).toThrow(/header CRC/);
  });

  it("rejects a wrong logo CRC", () => {
    expect(() => parseNdsHeader(corruptByte(buildNdsRom(), 0x15c))).toThrow(/logo CRC/);
  });

  it("rejects a section that ends beyond the ROM", () => {
    const rom = buildNdsRom();
    expect(() => parseNdsHeader(withField(rom, 0x44, rom.length))).toThrow(/fnt/);
  });

  it("rejects a buffer too short for a header", () => {
    expect(() => parseNdsHeader(new Uint8Array(0x100))).toThrow(NdsFormatError);
  });
});
