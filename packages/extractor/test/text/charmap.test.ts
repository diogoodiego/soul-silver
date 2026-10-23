import { describe, expect, it } from "vitest";
import { charToCode, CHARMAP, codeToChar } from "../../src/text/charmap.ts";

describe("character table", () => {
  it("maps digits, uppercase and lowercase letters and space", () => {
    expect(codeToChar(0x121)).toBe("0");
    expect(codeToChar(0x12a)).toBe("9");
    expect(codeToChar(0x12b)).toBe("A");
    expect(codeToChar(0x144)).toBe("Z");
    expect(codeToChar(0x145)).toBe("a");
    expect(codeToChar(0x15e)).toBe("z");
    expect(codeToChar(0x1de)).toBe(" ");
  });

  it.each([
    [0x1ab, "!"], [0x1ac, "?"], [0x1ad, ","], [0x1ae, "."], [0x1b1, "/"], [0x1b3, "’"],
    [0x1b4, "“"], [0x1b5, "”"], [0x1b9, "("], [0x1ba, ")"], [0x1bb, "♂"], [0x1bc, "♀"],
    [0x1be, "-"], [0x1c1, "+"], [0x1c2, "&"], [0x1c4, ":"], [0x1d2, "%"], [0x1e8, "°"],
    [0x1a8, "¥"],
  ] as const)("maps symbol %s", (code, char) => {
    expect(codeToChar(code)).toBe(char);
  });

  it.each([
    [0x188, "é"], [0x189, "ê"], [0x180, "á"], [0x181, "â"], [0x17f, "à"], [0x183, "ä"],
    [0x195, "ö"], [0x19b, "ü"], [0x186, "ç"], [0x187, "è"], [0x18d, "î"], [0x18b, "ì"],
    [0x18c, "í"], [0x190, "ñ"], [0x191, "ò"], [0x192, "ó"], [0x193, "ô"], [0x198, "ù"],
    [0x199, "ú"], [0x19a, "û"], [0x1a0, "œ"], [0x17e, "ß"], [0x163, "Ä"], [0x166, "À"],
    [0x167, "È"], [0x175, "Ö"], [0x179, "Ú"], [0x17b, "Ü"],
  ] as const)("maps accented letter %s", (code, char) => {
    expect(codeToChar(code)).toBe(char);
  });

  it("returns undefined for codes outside the table", () => {
    expect(codeToChar(0x0001)).toBeUndefined();
    expect(codeToChar(0x1a3)).toBeUndefined();
  });

  it("is one-to-one in both directions", () => {
    const codes = CHARMAP.map(([code]) => code);
    const chars = CHARMAP.map(([, char]) => char);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(chars).size).toBe(chars.length);
    for (const [code, char] of CHARMAP) {
      expect(charToCode(char)).toBe(code);
      expect(codeToChar(code)).toBe(char);
    }
  });

  it("never maps the layout codes (line, page, scroll, pad) as characters", () => {
    for (const layout of [0xe000, 0x25bc, 0x25bd, 0x1e2]) expect(codeToChar(layout)).toBeUndefined();
  });
});
