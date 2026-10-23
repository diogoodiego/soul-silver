import type { z } from "zod";

// Validation of game data files with errors a person can act on (principle III):
// file, field path and problem. See specs/004-game-data-extraction/contracts/game-data-api.md.

export interface GameDataError {
  file: string;
  /** Dots and indices, e.g. "records.5.baseStats.hp"; empty when the problem is in the value itself. */
  path: string;
  problem: string;
}

export type GameDataParseResult<D> = { ok: true; data: D } | { ok: false; error: GameDataError };

const TYPE_NAMES: Record<string, string> = {
  number: "número",
  int: "inteiro",
  string: "texto",
  boolean: "verdadeiro ou falso",
  object: "objeto",
  array: "lista",
  null: "nulo",
  undefined: "nada",
};

const typeName = (name: string) => TYPE_NAMES[name] ?? name;

interface Described {
  path: PropertyKey[];
  problem: string;
}

function describe(issue: z.core.$ZodIssue, prefix: PropertyKey[] = []): Described {
  const path = [...prefix, ...issue.path];
  switch (issue.code) {
    case "unrecognized_keys":
      return { path: [...path, issue.keys[0] ?? ""], problem: "campo desconhecido" };
    case "invalid_type": {
      const received = /received (\w+)/.exec(issue.message)?.[1];
      const base = `esperado ${typeName(issue.expected)}`;
      if (received === "undefined") return { path, problem: `campo obrigatório ausente (${base})` };
      return { path, problem: received ? `${base}, recebido ${typeName(received)}` : base };
    }
    case "too_small": {
      const bound = String(issue.minimum);
      if (issue.origin === "array") return { path, problem: `esperado ao menos ${bound} itens` };
      if (issue.origin === "string") return { path, problem: `esperado ao menos ${bound} caracteres` };
      return { path, problem: `esperado valor ${issue.inclusive ? "≥" : ">"} ${bound}` };
    }
    case "too_big": {
      const bound = String(issue.maximum);
      if (issue.origin === "array") return { path, problem: `esperado no máximo ${bound} itens` };
      if (issue.origin === "string") return { path, problem: `esperado no máximo ${bound} caracteres` };
      return { path, problem: `esperado valor ${issue.inclusive ? "≤" : "<"} ${bound}` };
    }
    case "invalid_value":
      return { path, problem: `valor não permitido (esperado ${issue.values.map((v) => JSON.stringify(v)).join(" ou ")})` };
    case "invalid_format":
      return { path, problem: "formato inválido" };
    case "invalid_union": {
      const first = issue.errors[0]?.[0];
      if (first) return describe(first, path);
      return { path, problem: "valor não confere com nenhuma das variantes permitidas" };
    }
    default:
      return { path, problem: issue.message };
  }
}

function toError(file: string, issue: z.core.$ZodIssue): GameDataError {
  const { path, problem } = describe(issue);
  return { file, path: path.map(String).join("."), problem };
}

/** Builds the parse/serialize functions for a set of file schemas keyed by kind. */
export function createGameDataCodec<S extends Record<string, z.ZodType>>(schemas: S) {
  type Kind = keyof S & string;

  function parseGameDataFile<K extends Kind>(kind: K, value: unknown, file: string): GameDataParseResult<z.output<S[K]>> {
    const result = schemas[kind]!.safeParse(value);
    if (result.success) return { ok: true, data: result.data as z.output<S[K]> };
    return { ok: false, error: toError(file, result.error.issues[0]!) };
  }

  function parseGameDataJson<K extends Kind>(kind: K, text: string, file: string): GameDataParseResult<z.output<S[K]>> {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      return { ok: false, error: { file, path: "", problem: `JSON inválido: ${(error as Error).message}` } };
    }
    return parseGameDataFile(kind, value, file);
  }

  /** Deterministic text (research R13): fields in schema order, two spaces, trailing newline. */
  function serializeGameDataFile<K extends Kind>(kind: K, data: z.output<S[K]>): string {
    const result = schemas[kind]!.safeParse(data);
    if (!result.success) {
      const { path, problem } = toError(kind, result.error.issues[0]!);
      throw new Error(`Dados inválidos para "${kind}" em "${path}": ${problem}`);
    }
    return `${JSON.stringify(result.data, null, 2)}\n`;
  }

  return { parseGameDataFile, parseGameDataJson, serializeGameDataFile };
}
