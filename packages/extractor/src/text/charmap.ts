// Character table of the DS game (English release). See specs/005-text-catalog/research.md R4.
// Codes not listed here are kept as {raw:XXXX} in the markup and reported; they are never dropped.

export const CHARMAP: ReadonlyArray<readonly [code: number, char: string]> = [
  // digits, letters, space
  ...Array.from({ length: 10 }, (_, i) => [0x121 + i, String(i)] as const),
  ...Array.from({ length: 26 }, (_, i) => [0x12b + i, String.fromCharCode(65 + i)] as const),
  ...Array.from({ length: 26 }, (_, i) => [0x145 + i, String.fromCharCode(97 + i)] as const),
  [0x1de, " "],
  // symbols
  [0x1a8, "¥"],
  [0x1ab, "!"],
  [0x1ac, "?"],
  [0x1ad, ","],
  [0x1ae, "."],
  [0x1b1, "/"],
  [0x1b3, "’"],
  [0x1b4, "“"],
  [0x1b5, "”"],
  [0x1b9, "("],
  [0x1ba, ")"],
  [0x1bb, "♂"],
  [0x1bc, "♀"],
  [0x1be, "-"],
  [0x1c1, "+"],
  [0x1c2, "&"],
  [0x1c4, ":"],
  [0x1d2, "%"],
  [0x1e8, "°"],
  // accented letters
  [0x163, "Ä"],
  [0x166, "À"],
  [0x167, "È"],
  [0x175, "Ö"],
  [0x179, "Ú"],
  [0x17b, "Ü"],
  [0x17e, "ß"],
  [0x17f, "à"],
  [0x180, "á"],
  [0x181, "â"],
  [0x183, "ä"],
  [0x186, "ç"],
  [0x187, "è"],
  [0x188, "é"],
  [0x189, "ê"],
  [0x18b, "ì"],
  [0x18c, "í"],
  [0x18d, "î"],
  [0x190, "ñ"],
  [0x191, "ò"],
  [0x192, "ó"],
  [0x193, "ô"],
  [0x195, "ö"],
  [0x198, "ù"],
  [0x199, "ú"],
  [0x19a, "û"],
  [0x19b, "ü"],
  [0x1a0, "œ"],
];

const BY_CODE = new Map<number, string>(CHARMAP);
const BY_CHAR = new Map<string, number>(CHARMAP.map(([code, char]) => [char, code]));

export function codeToChar(code: number): string | undefined {
  return BY_CODE.get(code);
}

export function charToCode(char: string): number | undefined {
  return BY_CHAR.get(char);
}
