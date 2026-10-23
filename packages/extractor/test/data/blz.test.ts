import { describe, expect, it } from "vitest";
import { BlzFormatError, decompressBlz } from "../../src/data/blz.ts";
import { encodeBlz } from "../fixtures/game-data/blz-encode.ts";

/** Deterministic pseudo-random bytes. */
function noise(length: number, seed = 1): Uint8Array {
  let state = seed;
  return Uint8Array.from({ length }, () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state >> 16;
  });
}

const repetitive = () => Uint8Array.from({ length: 600 }, (_, i) => "ABCABCABD".charCodeAt(i % 9));
const allLiteral = () => Uint8Array.from({ length: 200 }, (_, i) => (i * 37 + (i >> 3) * 11) & 0xff);

describe("decompressBlz", () => {
  it.each([
    ["random", () => noise(300)],
    ["repetitive", repetitive],
    ["all literals", allLiteral],
    ["a single byte", () => Uint8Array.of(7)],
    ["empty", () => new Uint8Array()],
    ["long runs", () => new Uint8Array(5000).fill(0xaa)],
  ])("restores %s data", (_name, make) => {
    const plain = make();
    expect(decompressBlz(encodeBlz(plain))).toEqual(plain);
  });

  it("really compresses repetitive data (the encoder is not just literals)", () => {
    expect(encodeBlz(repetitive()).length).toBeLessThan(repetitive().length / 2);
  });

  it("leaves the uncompressed head untouched", () => {
    const prefix = noise(64, 9);
    const plain = repetitive();
    const out = decompressBlz(encodeBlz(plain, prefix));
    expect(out.subarray(0, 64)).toEqual(prefix);
    expect(out.subarray(64)).toEqual(plain);
    expect(out.length).toBe(64 + plain.length);
  });

  it("throws BlzFormatError when the footer sizes exceed the buffer", () => {
    const data = encodeBlz(repetitive());
    new DataView(data.buffer).setUint32(data.length - 8, (8 << 24) | (data.length + 100), true);
    expect(() => decompressBlz(data)).toThrow(BlzFormatError);
  });

  it("throws BlzFormatError for a header length below 8", () => {
    const data = encodeBlz(repetitive());
    new DataView(data.buffer).setUint32(data.length - 8, (4 << 24) | (data.length - 4), true);
    expect(() => decompressBlz(data)).toThrow(BlzFormatError);
  });

  it("throws BlzFormatError for input shorter than the footer", () => {
    expect(() => decompressBlz(new Uint8Array(5))).toThrow(BlzFormatError);
  });

  it("throws BlzFormatError when the output size does not match the stream", () => {
    const data = encodeBlz(repetitive());
    const view = new DataView(data.buffer);
    view.setInt32(data.length - 4, view.getInt32(data.length - 4, true) + 5, true);
    expect(() => decompressBlz(data)).toThrow(BlzFormatError);
  });

  it("throws BlzFormatError for a match that reaches before the output", () => {
    // One flag byte (match) and a match of length 18 with the largest displacement, but no history.
    const bad = Uint8Array.of(0xff, 0xff, 0x80, 0, 0, 0, 0, 0, 0, 0, 0);
    const view = new DataView(bad.buffer);
    view.setUint32(3, (8 << 24) | 11, true);
    view.setInt32(7, 0, true);
    expect(() => decompressBlz(bad)).toThrow(BlzFormatError);
  });
});
