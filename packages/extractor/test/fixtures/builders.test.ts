// Sanity checks for the fixture builders, so parser test failures point at the
// parsers rather than at the fixtures.
import { describe, expect, it } from "vitest";
import { readAscii, readU16, readU32 } from "../../src/binary.ts";
import { crc16 } from "../../src/rom/crc16.ts";
import { buildNarc } from "./build-narc.ts";
import { buildNdsRom, corruptByte, HEADER_SIZE, MIN_ROM_SIZE, sha1Hex } from "./build-nds-rom.ts";

describe("buildNarc", () => {
  it("writes the documented header and sections", () => {
    const narc = buildNarc([Uint8Array.of(1, 2, 3), Uint8Array.of(4)]);
    expect(readAscii(narc, 0, 4)).toBe("NARC");
    expect([narc[4], narc[5]]).toEqual([0xfe, 0xff]);
    expect(readU16(narc, 6)).toBe(0x0100);
    expect(readU32(narc, 8)).toBe(narc.length);
    expect(readU16(narc, 12)).toBe(0x10);
    expect(readU16(narc, 14)).toBe(3);
    expect(readAscii(narc, 16, 4)).toBe("BTAF");
    expect(readU16(narc, 24)).toBe(2);
    const btnf = 16 + readU32(narc, 20);
    expect(readAscii(narc, btnf, 4)).toBe("BTNF");
    const gmif = btnf + readU32(narc, btnf + 4);
    expect(readAscii(narc, gmif, 4)).toBe("GMIF");
    expect(gmif + readU32(narc, gmif + 4)).toBe(narc.length);
  });
});

describe("buildNdsRom", () => {
  it("writes title, game code and valid CRCs", () => {
    const rom = buildNdsRom({ gameCode: "IPKE", title: "POKEMON HG" });
    expect(readAscii(rom, 0, 12)).toBe("POKEMON HG");
    expect(readAscii(rom, 0x0c, 4)).toBe("IPKE");
    expect(readU16(rom, 0x15c)).toBe(0xcf56);
    expect(readU16(rom, 0x15e)).toBe(crc16(rom, 0, 0x15e));
    expect(rom.length).toBeGreaterThanOrEqual(MIN_ROM_SIZE);
  });

  it("places sections after the header and inside the ROM", () => {
    const rom = buildNdsRom();
    for (const [offsetField, sizeField] of [[0x20, 0x2c], [0x30, 0x3c], [0x40, 0x44], [0x48, 0x4c], [0x50, 0x54], [0x58, 0x5c]] as const) {
      const offset = readU32(rom, offsetField);
      expect(offset).toBeGreaterThanOrEqual(HEADER_SIZE);
      expect(offset + readU32(rom, sizeField)).toBeLessThanOrEqual(rom.length);
    }
  });

  it("hashes and corrupts deterministically", () => {
    const rom = buildNdsRom();
    expect(sha1Hex(rom)).toBe(sha1Hex(buildNdsRom()));
    expect(sha1Hex(corruptByte(rom, HEADER_SIZE))).not.toBe(sha1Hex(rom));
  });
});
