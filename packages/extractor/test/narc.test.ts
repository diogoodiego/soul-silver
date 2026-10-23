import { describe, expect, it } from "vitest";
import { readU32 } from "../src/binary.ts";
import { isNarc, NarcFormatError, parseNarc } from "../src/nds/narc.ts";
import { buildNarc } from "./fixtures/build-narc.ts";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("parseNarc", () => {
  it("returns members in order, including empty ones", () => {
    const members = [bytes(1, 2, 3), bytes(), bytes(4, 5, 6, 7, 8)];
    const narc = parseNarc(buildNarc(members));
    expect(narc.members).toEqual(members);
    expect(narc.names).toBeUndefined();
  });

  it("returns names by member index when present", () => {
    const narc = parseNarc(buildNarc([bytes(1), bytes(2)], ["foo/bar.bin", "top.bin"]));
    const byName = Object.fromEntries(Object.entries(narc.names!).map(([i, name]) => [name, narc.members[Number(i)]]));
    expect(byName).toEqual({ "foo/bar.bin": bytes(1), "top.bin": bytes(2) });
  });

  it("rejects a wrong magic", () => {
    const data = buildNarc([bytes(1)]);
    data[0] = 0x58;
    expect(() => parseNarc(data)).toThrow(NarcFormatError);
  });

  it("rejects a wrong section magic", () => {
    const data = buildNarc([bytes(1)]);
    data[16] = 0x58;
    expect(() => parseNarc(data)).toThrow(/BTAF/);
  });

  it("rejects a member range beyond GMIF", () => {
    const data = buildNarc([bytes(1, 2)]);
    new DataView(data.buffer).setUint32(16 + 12 + 4, 0x1000, true);
    expect(() => parseNarc(data)).toThrow(NarcFormatError);
  });

  it("rejects a section size beyond the file", () => {
    const data = buildNarc([bytes(1)]);
    new DataView(data.buffer).setUint32(16 + 4, data.length, true);
    expect(() => parseNarc(data)).toThrow(NarcFormatError);
  });

  it("does not copy member bytes", () => {
    const data = buildNarc([bytes(1, 2)]);
    expect(parseNarc(data).members[0]!.buffer).toBe(data.buffer);
    expect(readU32(data, 8)).toBe(data.length);
  });
});

describe("isNarc", () => {
  it("is true only for data starting with NARC", () => {
    expect(isNarc(buildNarc([]))).toBe(true);
    expect(isNarc(new TextEncoder().encode("NAR"))).toBe(false);
    expect(isNarc(new TextEncoder().encode("BTAF...."))).toBe(false);
  });
});
