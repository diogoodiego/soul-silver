// Conversion between the 16-bit words of a text and its neutral markup.
// See specs/005-text-catalog/contracts/markup.md and research R3, R5, R6.
import { charToCode, codeToChar } from "./charmap.ts";
import { parseMarkup, serializeMarkup, variableByCommand, variableByName, type MarkupToken } from "@soulsilver/shared/text";

const COMMAND = 0xfffe;
const COLOR = 0xff00;
const LAYOUT: ReadonlyMap<number, MarkupToken["kind"]> = new Map<number, MarkupToken["kind"]>([
  [0xe000, "newline"],
  [0x25bc, "page"],
  [0x25bd, "scroll"],
  [0x1e2, "pad"],
]);
const LAYOUT_TOKEN: Record<string, string> = { newline: "{n}", page: "{page}", scroll: "{scroll}", pad: "{pad}" };

export type UnknownUse =
  | { kind: "character"; code: number }
  | { kind: "command"; command: number; params: number };

export interface MarkupResult {
  text: string;
  unknown: UnknownUse[];
}

/** Command ids that print a variable (research R5): 0x0100–0x04FF and 0x3400–0x34FF. */
const isVariableRange = (command: number) => (command >= 0x0100 && command <= 0x04ff) || (command >= 0x3400 && command <= 0x34ff);

const hex4 = (value: number) => value.toString(16).toUpperCase().padStart(4, "0");

/** Raw fallback for a command the markup cannot express: each word becomes {raw:XXXX}. */
function rawWords(words: readonly number[], from: number, to: number): string {
  return words.slice(from, to).map((w) => `{raw:${hex4(w)}}`).join("");
}

export function wordsToMarkup(words: readonly number[]): MarkupResult {
  const unknown: UnknownUse[] = [];
  let text = "";
  let i = 0;
  while (i < words.length) {
    const word = words[i]!;

    if (word === COMMAND) {
      const command = words[i + 1];
      const count = words[i + 2];
      if (command === undefined || count === undefined || i + 3 + count > words.length) {
        text += rawWords(words, i, words.length);
        unknown.push({ kind: "command", command: command ?? COMMAND, params: count ?? 0 });
        break;
      }
      const params = words.slice(i + 3, i + 3 + count);
      const variable = variableByCommand(command);

      if (variable !== undefined && count === 2) {
        const [slot, flag] = params as [number, number];
        text += flag === 0 ? `{${variable.name}:${slot}}` : `{${variable.name}:${slot},${flag}}`;
      } else if (variable === undefined && count === 2 && isVariableRange(command)) {
        const [slot, flag] = params as [number, number];
        const name = `var${hex4(command)}`;
        text += flag === 0 ? `{${name}:${slot}}` : `{${name}:${slot},${flag}}`;
      } else if (command === COLOR && count === 1) {
        text += `{color:${params[0]}}`;
      } else if (variable !== undefined || command === COLOR) {
        // A named command with another parameter count cannot be written as {cmd}: keep its words.
        text += rawWords(words, i, i + 3 + count);
        unknown.push({ kind: "command", command, params: count });
      } else {
        text += count === 0 ? `{cmd:${hex4(command)}}` : `{cmd:${hex4(command)}:${params.join(",")}}`;
        unknown.push({ kind: "command", command, params: count });
      }
      i += 3 + count;
      continue;
    }

    const layout = LAYOUT.get(word);
    if (layout !== undefined) {
      text += LAYOUT_TOKEN[layout]!;
    } else {
      const char = codeToChar(word);
      if (char !== undefined) {
        text += serializeMarkup([{ kind: "text", value: char }]);
      } else {
        text += `{raw:${hex4(word)}}`;
        unknown.push({ kind: "character", code: word });
      }
    }
    i += 1;
  }
  return { text, unknown };
}

export function markupToWords(text: string): number[] {
  const words: number[] = [];
  for (const token of parseMarkup(text)) {
    switch (token.kind) {
      case "text":
        for (const char of token.value) {
          const code = charToCode(char);
          if (code === undefined) throw new Error(`Caractere sem código no jogo: "${char}"`);
          words.push(code);
        }
        break;
      case "newline":
        words.push(0xe000);
        break;
      case "page":
        words.push(0x25bc);
        break;
      case "scroll":
        words.push(0x25bd);
        break;
      case "pad":
        words.push(0x1e2);
        break;
      case "color":
        words.push(COMMAND, COLOR, 1, token.color);
        break;
      case "variable": {
        const command = variableByName(token.name)?.command ?? parseInt(token.name.slice(3), 16);
        words.push(COMMAND, command, 2, token.slot, token.flag);
        break;
      }
      case "command":
        words.push(COMMAND, token.id, token.params.length, ...token.params);
        break;
      case "raw":
        words.push(token.code);
        break;
    }
  }
  return words;
}
