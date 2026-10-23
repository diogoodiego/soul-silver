import { describe, expect, it } from "vitest";
import { readAscii, readU16, readU32 } from "../src/binary.ts";

const bytes = Uint8Array.from([0x34, 0x12, 0x78, 0x56, 0x34, 0x12, 0x41, 0x42, 0x00, 0x43]);

describe("binary readers", () => {
  it("reads little-endian integers", () => {
    expect(readU16(bytes, 0)).toBe(0x1234);
    expect(readU32(bytes, 2)).toBe(0x12345678);
  });

  it("reads u32 values above 2^31 as unsigned", () => {
    expect(readU32(Uint8Array.from([0xff, 0xff, 0xff, 0xff]), 0)).toBe(0xffffffff);
  });

  it("reads ASCII up to the first NUL", () => {
    expect(readAscii(bytes, 6, 4)).toBe("AB");
    expect(readAscii(bytes, 6, 2)).toBe("AB");
  });

  it("honours the view offset of subarrays", () => {
    expect(readU16(bytes.subarray(2), 0)).toBe(0x5678);
  });

  it.each([
    () => readU16(bytes, 9),
    () => readU32(bytes, 7),
    () => readU32(bytes, -1),
    () => readAscii(bytes, 8, 3),
  ])("throws RangeError naming the offset when out of bounds (%#)", (read) => {
    expect(read).toThrow(RangeError);
    expect(read).toThrow(/offset/);
  });
});
