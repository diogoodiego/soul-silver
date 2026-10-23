import { describe, expect, it } from "vitest";
import { crc16 } from "../../src/rom/crc16.ts";

describe("crc16 (CRC-16/MODBUS)", () => {
  it("matches the standard check value", () => {
    const input = new TextEncoder().encode("123456789");
    expect(crc16(input, 0, input.length)).toBe(0x4b37);
  });

  it("returns the initial value for an empty range", () => {
    expect(crc16(new Uint8Array(4), 2, 2)).toBe(0xffff);
  });

  it("only covers [start, end)", () => {
    const input = new TextEncoder().encode("xx123456789yy");
    expect(crc16(input, 2, 11)).toBe(0x4b37);
  });
});
