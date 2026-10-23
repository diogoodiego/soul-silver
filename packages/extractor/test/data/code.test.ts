import { describe, expect, it } from "vitest";
import { decompressArm9, decompressOverlay, readOverlayTable } from "../../src/data/code.ts";
import { ARM9_PARAMS_MAGIC, ARM9_PARAMS_OFFSET, encodeArm9, encodeBlz } from "../fixtures/game-data/blz-encode.ts";

const body = () => Uint8Array.from({ length: 400 }, (_, i) => "XYZXYZW".charCodeAt(i % 7));

/** One 32-byte y9 entry: id, ram address, ram size, bss size, init start/end, file id, flags. */
function y9Entry(index: number, options: { compressed: boolean; size?: number }): Uint8Array {
  const entry = new Uint8Array(32);
  const view = new DataView(entry.buffer);
  view.setUint32(0, index, true);
  view.setUint32(0x18, 100 + index, true);
  view.setUint32(0x1c, ((options.compressed ? 1 : 0) << 24) | (options.size ?? 0), true);
  return entry;
}

describe("decompressArm9", () => {
  it("decompresses the body and keeps the head and the trailing bytes", () => {
    const { file, expected } = encodeArm9(body());
    expect(file.length).not.toBe(expected.length);
    expect(decompressArm9(file, 0x02000000)).toEqual(expected);
  });

  it("uses the load address to find the end of the compressed region", () => {
    const { file, expected } = encodeArm9(body(), 0x02004000);
    expect(decompressArm9(file, 0x02004000)).toEqual(expected);
  });

  it("returns the input as is when compressedStaticEnd is 0", () => {
    const { file } = encodeArm9(body());
    const plain = file.slice();
    new DataView(plain.buffer).setUint32(ARM9_PARAMS_OFFSET + 0x14, 0, true);
    expect(decompressArm9(plain, 0x02000000)).toEqual(plain);
  });

  it("throws when the module params magic is missing", () => {
    const { file } = encodeArm9(body());
    const broken = file.slice();
    broken.set(new Uint8Array(ARM9_PARAMS_MAGIC.length), ARM9_PARAMS_OFFSET + 0x1c);
    expect(() => decompressArm9(broken, 0x02000000)).toThrow(/module params/i);
  });

  it("throws when compressedStaticEnd points outside the file", () => {
    const { file } = encodeArm9(body());
    const broken = file.slice();
    new DataView(broken.buffer).setUint32(ARM9_PARAMS_OFFSET + 0x14, 0x03000000, true);
    expect(() => decompressArm9(broken, 0x02000000)).toThrow(/compressedStaticEnd/);
  });
});

describe("readOverlayTable", () => {
  it("reads id, file id and the compressed flag of each entry", () => {
    const y9 = Uint8Array.from([...y9Entry(0, { compressed: true, size: 0x1234 }), ...y9Entry(1, { compressed: false })]);
    expect(readOverlayTable(y9)).toEqual([
      { index: 0, fileId: 100, compressed: true },
      { index: 1, fileId: 101, compressed: false },
    ]);
  });

  it("ignores trailing bytes that do not make a whole entry", () => {
    expect(readOverlayTable(new Uint8Array(40))).toHaveLength(1);
  });
});

describe("decompressOverlay", () => {
  it("decompresses an overlay flagged as compressed", () => {
    const plain = body();
    expect(decompressOverlay(encodeBlz(plain), { index: 0, fileId: 0, compressed: true })).toEqual(plain);
  });

  it("returns an uncompressed overlay as is", () => {
    const plain = body();
    expect(decompressOverlay(plain, { index: 1, fileId: 1, compressed: false })).toEqual(plain);
  });
});
