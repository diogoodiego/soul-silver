import { describe, expect, it } from "vitest";
import { decodeBank, encodeBank } from "../../src/text/bank.ts";
import { markupToWords, wordsToMarkup } from "../../src/text/words.ts";
import { buildBank, randomBank } from "../fixtures/text/build-bank.ts";

describe("round trip (SC-003)", () => {
  it("recodes 200 random banks byte for byte, through the markup too", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const bytes = randomBank(seed);
      const bank = decodeBank(bytes);
      for (const entry of bank.entries) {
        expect(markupToWords(wordsToMarkup(entry.words).text), `bank ${seed}`).toEqual(entry.words);
      }
      expect(encodeBank(bank), `bank ${seed}`).toEqual(bytes);
    }
  });

  it("keeps a bank with one text and a compressed text ending on a word boundary", () => {
    const bytes = buildBank([{ words: [0x12b, 0x145, 0x146, 0x147, 0x148], compressed: true, unterminated: true }], { seed: 9 });
    expect(encodeBank(decodeBank(bytes))).toEqual(bytes);
  });
});
