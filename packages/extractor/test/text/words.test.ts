import { describe, expect, it } from "vitest";
import { markupToWords, wordsToMarkup } from "../../src/text/words.ts";

describe("wordsToMarkup", () => {
  it("maps layout codes", () => {
    expect(wordsToMarkup([0xe000, 0x25bc, 0x25bd, 0x1e2]).text).toBe("{n}{page}{scroll}{pad}");
  });

  it("maps characters through the table", () => {
    expect(wordsToMarkup([0x12b, 0x145, 0x1de, 0x1ab]).text).toBe("Aa !");
  });

  it("maps a variable command with two parameters to its name", () => {
    expect(wordsToMarkup([0xfffe, 0x0103, 2, 0, 0]).text).toBe("{trainer-name:0}");
    expect(wordsToMarkup([0xfffe, 0x0134, 2, 1, 2]).text).toBe("{number3:1,2}");
  });

  it("maps an unnamed variable id to varXXXX", () => {
    expect(wordsToMarkup([0xfffe, 0x0104, 2, 1, 0]).text).toBe("{var0104:1}");
  });

  it("maps color", () => {
    expect(wordsToMarkup([0xfffe, 0xff00, 1, 1, 0xfffe, 0xff00, 1, 0]).text).toBe("{color:1}{color:0}");
  });

  it("maps other commands with their parameters", () => {
    expect(wordsToMarkup([0xfffe, 0xff02, 2, 1, 0]).text).toBe("{cmd:FF02:1,0}");
    expect(wordsToMarkup([0xfffe, 0x0206, 0]).text).toBe("{cmd:0206}");
  });

  it("keeps an unknown character as raw and lists it", () => {
    const result = wordsToMarkup([0x1a3]);
    expect(result.text).toBe("{raw:01A3}");
    expect(result.unknown).toEqual([{ kind: "character", code: 0x1a3 }]);
  });

  it("reports unknown commands", () => {
    const result = wordsToMarkup([0xfffe, 0xff02, 2, 1, 0]);
    expect(result.unknown).toEqual([{ kind: "command", command: 0xff02, params: 2 }]);
  });

  it("keeps a named command with an unexpected parameter count as raw words, so nothing is lost", () => {
    const result = wordsToMarkup([0xfffe, 0x0103, 1, 0]);
    expect(result.text).toBe("{raw:FFFE}{raw:0103}{raw:0001}{raw:0000}");
    expect(markupToWords(result.text)).toEqual([0xfffe, 0x0103, 1, 0]);
  });
});

describe("markupToWords", () => {
  it("encodes characters, layout and commands", () => {
    expect(markupToWords("Hi{n}{trainer-name:0}")).toEqual([0x132, 0x14d, 0xe000, 0xfffe, 0x0103, 2, 0, 0]);
    expect(markupToWords("{n}{page}")).toEqual([0xe000, 0x25bc]);
  });

  it("encodes a variable with its flag, and omits the flag when zero", () => {
    expect(markupToWords("{number3:1,2}")).toEqual([0xfffe, 0x0134, 2, 1, 2]);
    expect(markupToWords("{trainer-name:0}")).toEqual([0xfffe, 0x0103, 2, 0, 0]);
  });

  it("encodes color and unnamed commands", () => {
    expect(markupToWords("{color:1}")).toEqual([0xfffe, 0xff00, 1, 1]);
    expect(markupToWords("{cmd:FF02:1,0}")).toEqual([0xfffe, 0xff02, 2, 1, 0]);
  });

  it("encodes raw codes exactly", () => {
    expect(markupToWords("{raw:01A3}")).toEqual([0x1a3]);
  });

  it("refuses a character that has no code", () => {
    expect(() => markupToWords("☃")).toThrow(/☃/);
  });
});

describe("round trip", () => {
  const samples: number[][] = [
    [0x12b, 0x145, 0xe000, 0x25bc],
    [0xfffe, 0x0103, 2, 0, 0, 0x1ab],
    [0xfffe, 0xff00, 1, 3, 0x12b, 0xfffe, 0xff00, 1, 0],
    [0xfffe, 0x0134, 2, 1, 2, 0x1de],
    [0xfffe, 0xff02, 2, 1, 0, 0x1a3],
    [0xfffe, 0x0103, 1, 0],
    [0xfffe, 0x0206, 0],
    [0x1de, 0x1e2, 0x25bd],
  ];

  it.each(samples.map((words) => [words]))("round trips %j", (words) => {
    expect(markupToWords(wordsToMarkup(words).text)).toEqual(words);
  });
});
