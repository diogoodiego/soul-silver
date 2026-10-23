// Filling variables of a text and the screen view used by search. See contracts/text-api.md.
import { parseMarkup, serializeMarkup, type MarkupToken } from "./markup.ts";

export class TextFormatError extends Error {
  override name = "TextFormatError";
  readonly id: string | undefined;
  readonly variable: string;
  readonly problem: string;

  constructor(variable: string, problem: string, id?: string) {
    const where = id === undefined ? "" : ` no texto ${id}`;
    super(`Variável "${variable}"${where}: ${problem}`);
    this.id = id;
    this.variable = variable;
    this.problem = problem;
  }
}

export type TextValues = Readonly<Record<string, string | number>>;

const keyOf = (t: { name: string; slot: number }) => `${t.name}:${t.slot}`;

/** Variable keys "name:slot" of a text, each once, in order of appearance. */
export function textVariables(text: string): string[] {
  const keys: string[] = [];
  for (const token of parseMarkup(text)) {
    if (token.kind !== "variable") continue;
    const key = keyOf(token);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * Fills the variables of a text and returns markup. Missing or unused values are refused.
 * Inserted values are escaped, so a value with braces cannot become a command.
 */
export function formatText(text: string, values: TextValues, id?: string): string {
  const tokens = parseMarkup(text);
  const used = new Set<string>();
  const filled: MarkupToken[] = tokens.map((token) => {
    if (token.kind !== "variable") return token;
    const key = keyOf(token);
    used.add(key);
    const value = values[key];
    if (value === undefined) throw new TextFormatError(key, "valor não fornecido", id);
    if (token.name.startsWith("number") && typeof value !== "number" && !/^\d+$/.test(value)) {
      throw new TextFormatError(key, `esperado número, recebido "${value}"`, id);
    }
    return { kind: "text", value: String(value) };
  });
  for (const key of Object.keys(values)) {
    if (!used.has(key)) throw new TextFormatError(key, "valor fornecido, mas o texto não usa essa variável", id);
  }
  return serializeMarkup(filled);
}

/** How the text reads on screen: breaks become spaces, colors and commands go, variables stay literal. */
export function screenText(text: string): string {
  let out = "";
  for (const token of parseMarkup(text)) {
    switch (token.kind) {
      case "text":
        out += token.value;
        break;
      case "newline":
      case "page":
      case "scroll":
      case "pad":
        out += " ";
        break;
      case "variable":
        out += `{${token.name}:${token.slot}${token.flag === 0 ? "" : `,${token.flag}`}}`;
        break;
      default:
        break;
    }
  }
  return out.replace(/ +/g, " ");
}
