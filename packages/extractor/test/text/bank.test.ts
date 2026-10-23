import { describe, expect, it } from "vitest";
import { BankFormatError, decodeBank, encodeBank } from "../../src/text/bank.ts";
import { buildBank, randomBank } from "../fixtures/text/build-bank.ts";

const plain = [
  { words: [0x12b, 0x145, 0x1de, 0x12c] },
  { words: [0xe000, 0x25bc] },
  { words: [] },
];

describe("decodeBank", () => {
  it.each([0, 1, 0xffff])("decodes a bank built with seed %i", (seed) => {
    const bank = decodeBank(buildBank(plain, { seed }));
    expect(bank.seed).toBe(seed);
    expect(bank.entries.map((e) => e.words)).toEqual(plain.map((p) => p.words));
    expect(bank.entries.every((e) => !e.compressed)).toBe(true);
  });

  it("applies the per-entry key to the offset table", () => {
    const bank = decodeBank(buildBank([{ words: [0x12b] }, { words: [0x12c] }], { seed: 0x1234 }));
    expect(bank.entries.map((e) => e.words)).toEqual([[0x12b], [0x12c]]);
  });

  it("decodes a compressed entry to its characters", () => {
    const words = [0x12b, 0x145, 0x146, 0x147, 0x148, 0x149, 0x14a];
    const bank = decodeBank(buildBank([{ words, compressed: true }], { seed: 7 }));
    expect(bank.entries[0]).toEqual({ compressed: true, terminated: true, words });
  });

  it("decodes a compressed entry whose last character fills a word exactly", () => {
    const words = [0x12b, 0x12c, 0x12d, 0x12e, 0x12f];
    const bank = decodeBank(buildBank([{ words, compressed: true }], { seed: 1 }));
    expect(bank.entries[0]!.words).toEqual(words);
  });

  it("decodes a compressed text with no 0x1FF end, and recodes it to the same bytes", () => {
    const words = [0x12b, 0x145, 0x146, 0x147, 0x148, 0x149];
    const bytes = buildBank([{ words, compressed: true, unterminated: true }], { seed: 21 });
    const bank = decodeBank(bytes);
    expect(bank.entries[0]).toEqual({ compressed: true, terminated: false, words });
    expect(encodeBank(bank)).toEqual(bytes);
  });

  it("refuses padding that contains a zero", () => {
    // Six characters with no end: 54 bits fill the first 54 bits of the 4th packed word, so bits 9–14
    // of that word are padding. Table of one entry = 12 bytes; packed word j sits at 12 + 2·j.
    // The 4th packed word is body word 4 (body word 0 is the 0xF100 marker).
    const bytes = buildBank([{ words: [0x12b, 0x145, 0x146, 0x147, 0x148, 0x149], compressed: true, unterminated: true }], { seed: 21 });
    const offset = 12 + 2 * 4;
    const view = new DataView(bytes.buffer);
    view.setUint16(offset, view.getUint16(offset, true) ^ (1 << 9), true);
    expect(() => decodeBank(bytes)).toThrow(BankFormatError);
  });

  it("decodes an empty text to no words", () => {
    expect(decodeBank(buildBank([{ words: [] }], { seed: 3 })).entries[0]!.words).toEqual([]);
  });

  it("decodes a bank with no entries", () => {
    expect(decodeBank(buildBank([], { seed: 9 })).entries).toEqual([]);
  });

  it("refuses a truncated offset table, naming the bank", () => {
    expect(() => decodeBank(new Uint8Array(3))).toThrow(BankFormatError);
  });

  it("refuses an entry that runs past the end of the file", () => {
    const bytes = buildBank(plain, { seed: 5 });
    expect(() => decodeBank(bytes.subarray(0, bytes.length - 6))).toThrow(/banco|bank/i);
  });

  it("refuses an entry without the 0xFFFF terminator", () => {
    const bytes = buildBank([{ words: [0x12b] }], { seed: 2 });
    // Last word is the terminator (index 1): its key is the text key advanced once.
    const key = (0x91bd3 + 0x493d) & 0xffff;
    new DataView(bytes.buffer).setUint16(bytes.length - 2, (0x0000 ^ key) & 0xffff, true);
    expect(() => decodeBank(bytes)).toThrow(BankFormatError);
  });
});

describe("encodeBank", () => {
  it.each([[1], [2], [3]])("round trips a hand-made bank (case %i)", (n) => {
    const bytes = buildBank(plain.slice(0, n), { seed: 40 + n });
    expect(encodeBank(decodeBank(bytes))).toEqual(bytes);
  });

  it("round trips compressed entries", () => {
    const bytes = buildBank([{ words: [0x12b, 0x145, 0x1de], compressed: true }], { seed: 11 });
    expect(encodeBank(decodeBank(bytes))).toEqual(bytes);
  });

  it("round trips 200 random banks byte for byte (SC-003)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const bytes = randomBank(seed);
      expect(encodeBank(decodeBank(bytes)), `bank ${seed}`).toEqual(bytes);
    }
  });
});
