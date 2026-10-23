// Neutral markup of game texts. Grammar and vocabulary: specs/005-text-catalog/contracts/markup.md.
import { TEXT_VARIABLES, variableByName } from "./variables.ts";

export type MarkupToken =
  | { kind: "text"; value: string }
  | { kind: "newline" }
  | { kind: "page" }
  | { kind: "scroll" }
  | { kind: "pad" }
  | { kind: "color"; color: number }
  | { kind: "variable"; name: string; slot: number; flag: number }
  | { kind: "command"; id: number; params: number[] }
  | { kind: "raw"; code: number };

export class MarkupError extends Error {
  override name = "MarkupError";
  readonly position: number;
  readonly problem: string;

  constructor(position: number, problem: string) {
    super(`Marcação inválida na posição ${position}: ${problem}`);
    this.position = position;
    this.problem = problem;
  }
}

const SIMPLE: ReadonlyMap<string, MarkupToken["kind"]> = new Map([
  ["n", "newline"],
  ["page", "page"],
  ["scroll", "scroll"],
  ["pad", "pad"],
]);

const CANONICAL_INT = /^(0|[1-9]\d*)$/;
const HEX4 = /^[0-9A-F]{4}$/;
const NAMED_COMMAND_IDS = new Set<number>(TEXT_VARIABLES.map((v) => v.command));
const COLOR_COMMAND = 0xff00;

function canonicalInt(text: string, min: number, max: number, at: number, what: string): number {
  if (!CANONICAL_INT.test(text)) throw new MarkupError(at, `${what}: forma canônica exigida (dígitos sem zeros à esquerda)`);
  const value = Number(text);
  if (value < min || value > max) throw new MarkupError(at, `${what}: esperado ${min} a ${max}, recebido ${value}`);
  return value;
}

/** Parses one `{…}` body starting at `start` (the index after `{`). Returns the token and the index after `}`. */
function readCommand(text: string, start: number): { token: MarkupToken; end: number } {
  const close = text.indexOf("}", start);
  if (close < 0) throw new MarkupError(start - 1, "chave sem fechar");
  const body = text.slice(start, close);
  const colon = body.indexOf(":");
  const name = colon < 0 ? body : body.slice(0, colon);
  const args = colon < 0 ? undefined : body.slice(colon + 1);
  const end = close + 1;
  const at = start - 1;

  const simple = SIMPLE.get(name);
  if (simple !== undefined) {
    if (args !== undefined) throw new MarkupError(at, `"${name}" não aceita argumentos`);
    return { token: { kind: simple } as MarkupToken, end };
  }

  if (name === "color") {
    if (args === undefined) throw new MarkupError(at, "color precisa de um número");
    return { token: { kind: "color", color: canonicalInt(args, 0, 65535, at, "color") }, end };
  }

  if (name === "raw") {
    if (args === undefined || !HEX4.test(args)) throw new MarkupError(at, "raw precisa de 4 dígitos hexadecimais maiúsculos");
    return { token: { kind: "raw", code: parseInt(args, 16) }, end };
  }

  if (name === "cmd") {
    if (args === undefined || !HEX4.test(args.slice(0, 4))) {
      throw new MarkupError(at, "cmd precisa de 4 dígitos hexadecimais maiúsculos");
    }
    const id = parseInt(args.slice(0, 4), 16);
    if (id === COLOR_COMMAND) throw new MarkupError(at, "use {color:N} em vez de {cmd:FF00}");
    if (NAMED_COMMAND_IDS.has(id)) throw new MarkupError(at, "comando com nome: use o nome da variável");
    const rest = args.slice(4);
    if (rest === "") return { token: { kind: "command", id, params: [] }, end };
    if (!rest.startsWith(":") || rest.length === 1) throw new MarkupError(at, "parâmetros de cmd: use :p1,p2");
    const params = rest.slice(1).split(",").map((p, i) => canonicalInt(p, 0, 65535, at, `parâmetro ${i + 1} de cmd`));
    return { token: { kind: "command", id, params }, end };
  }

  const variable = variableByName(name) ?? (/^var[0-9A-F]{4}$/.test(name) ? { name } : undefined);
  if (variable === undefined) throw new MarkupError(at, `nome desconhecido: "${name}"`);
  if (args === undefined) throw new MarkupError(at, `variável "${name}" precisa de slot (ex.: {${name}:0})`);
  const [slotText, flagText, extra] = args.split(",");
  if (extra !== undefined || slotText === undefined) throw new MarkupError(at, `variável "${name}": use {nome:slot} ou {nome:slot,flag}`);
  const slot = canonicalInt(slotText, 0, 255, at, `slot de "${name}"`);
  if (flagText === undefined) return { token: { kind: "variable", name, slot, flag: 0 }, end };
  if (flagText === "0") throw new MarkupError(at, `flag de "${name}": forma canônica omite o flag quando for 0`);
  const flag = canonicalInt(flagText, 1, 255, at, `flag de "${name}"`);
  return { token: { kind: "variable", name, slot, flag }, end };
}

export function parseMarkup(text: string): MarkupToken[] {
  const tokens: MarkupToken[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer !== "") tokens.push({ kind: "text", value: buffer });
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\") {
      const next = text[i + 1];
      if (next !== "{" && next !== "}" && next !== "\\") throw new MarkupError(i, "escape inválido: use \\{, \\} ou \\\\");
      buffer += next;
      i += 2;
    } else if (ch === "{") {
      flush();
      const { token, end } = readCommand(text, i + 1);
      tokens.push(token);
      i = end;
    } else if (ch === "}") {
      throw new MarkupError(i, "chave de fechamento sem abertura (use \\})");
    } else if (ch === "\n" || ch === "\r") {
      throw new MarkupError(i, "quebra de linha real: use {n}");
    } else {
      buffer += ch;
      i += 1;
    }
  }
  flush();
  return tokens;
}

const ESCAPE_TEXT = (value: string) => value.replace(/[\\{}]/g, (c) => `\\${c}`);

export function serializeMarkup(tokens: readonly MarkupToken[]): string {
  return tokens
    .map((t): string => {
      switch (t.kind) {
        case "text":
          return ESCAPE_TEXT(t.value);
        case "newline":
          return "{n}";
        case "page":
          return "{page}";
        case "scroll":
          return "{scroll}";
        case "pad":
          return "{pad}";
        case "color":
          return `{color:${t.color}}`;
        case "variable":
          return t.flag === 0 ? `{${t.name}:${t.slot}}` : `{${t.name}:${t.slot},${t.flag}}`;
        case "command":
          return t.params.length === 0
            ? `{cmd:${t.id.toString(16).toUpperCase().padStart(4, "0")}}`
            : `{cmd:${t.id.toString(16).toUpperCase().padStart(4, "0")}:${t.params.join(",")}}`;
        case "raw":
          return `{raw:${t.code.toString(16).toUpperCase().padStart(4, "0")}}`;
      }
    })
    .join("");
}
