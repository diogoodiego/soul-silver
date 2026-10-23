// Catalog of texts per language, with fallback to English and checks of translations.
// See specs/005-text-catalog/data-model.md and contracts/text-api.md.
import { formatTextId, parseTextId, TEXT_REF_BANKS, type TextRefCatalog } from "./ids.ts";
import { parseMarkup } from "./markup.ts";
import type { TextBankFile } from "./schemas.ts";

export class UnknownTextError extends Error {
  override name = "UnknownTextError";
  readonly id: string;

  constructor(id: string) {
    super(`Texto desconhecido: ${id}`);
    this.id = id;
  }
}

export interface TranslationProblem {
  id: string;
  variable: string;
  problem: string;
}

export interface TextLookup {
  text: string;
  language: string;
  /** True when the text is English because the requested language does not have it. */
  fallback: boolean;
}

export interface TextCatalog {
  languages(): string[];
  get(id: string, language: string): TextLookup;
  has(id: string, language?: string): boolean;
  /** Ids of a language (English when omitted), in bank and index order. */
  ids(language?: string): string[];
}

const DEFAULT_FALLBACK = "en";

/** Variables of a text as "name:slot" keys, with the flag kept apart, sorted for comparison. */
function variablesOf(text: string): string[] {
  return parseMarkup(text)
    .flatMap((t) => (t.kind === "variable" ? [`${t.name}:${t.slot}${t.flag === 0 ? "" : `,${t.flag}`}`] : []))
    .sort();
}

function textsOf(banks: readonly TextBankFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of banks) {
    for (const record of file.records) map.set(formatTextId(file.bank, record.id), record.text);
  }
  return map;
}

export function validateTranslation(base: readonly TextBankFile[], translation: readonly TextBankFile[]): TranslationProblem[] {
  const english = textsOf(base);
  const problems: TranslationProblem[] = [];
  for (const [id, text] of textsOf(translation)) {
    const original = english.get(id);
    if (original === undefined) {
      problems.push({ id, variable: "", problem: "texto não existe no inglês" });
      continue;
    }
    const want = variablesOf(original);
    const got = variablesOf(text);
    const nameOf = (key: string) => key.split(",")[0]!;
    // A key whose name appears on the other side with a different flag is reported once, as a flag change.
    for (const key of want.filter((k) => !got.includes(k))) {
      const changed = got.some((g) => nameOf(g) === nameOf(key));
      if (!changed) problems.push({ id, variable: nameOf(key), problem: "variável do inglês ausente na tradução" });
    }
    for (const key of got.filter((k) => !want.includes(k))) {
      const sameName = want.some((w) => nameOf(w) === nameOf(key));
      problems.push({
        id,
        variable: nameOf(key),
        problem: sameName ? "flag diferente do inglês" : "variável que o inglês não usa",
      });
    }
  }
  return problems;
}

export function createTextCatalog(
  sources: Record<string, readonly TextBankFile[]>,
  options: { fallback?: string } = {},
): TextCatalog {
  const fallback = options.fallback ?? DEFAULT_FALLBACK;
  const base = sources[fallback];
  if (base === undefined) throw new Error(`Idioma de fallback "${fallback}" não foi fornecido`);

  for (const [language, banks] of Object.entries(sources)) {
    if (language === fallback) continue;
    const problems = validateTranslation(base, banks);
    if (problems.length > 0) {
      const first = problems[0]!;
      throw new Error(`Tradução ${language} inválida no texto ${first.id}: variável "${first.variable}" — ${first.problem}`);
    }
  }

  const tables = new Map<string, Map<string, string>>();
  for (const [language, banks] of Object.entries(sources)) tables.set(language, textsOf(banks));
  const englishTable = tables.get(fallback)!;

  return {
    languages: () => Object.keys(sources),
    get(id, language) {
      const canonical = formatTextId(parseTextId(id).bank, parseTextId(id).index);
      const own = tables.get(language)?.get(canonical);
      if (own !== undefined) return { text: own, language, fallback: false };
      const english = englishTable.get(canonical);
      if (english === undefined) throw new UnknownTextError(id);
      return { text: english, language: fallback, fallback: true };
    },
    has(id, language) {
      const canonical = formatTextId(parseTextId(id).bank, parseTextId(id).index);
      if (language === undefined) return englishTable.has(canonical);
      return tables.get(language)?.has(canonical) ?? false;
    },
    ids(language) {
      const table: Map<string, string> = language === undefined ? englishTable : (tables.get(language) ?? new Map<string, string>());
      return [...table.keys()].sort();
    },
  };
}

/**
 * Feature 004 references: `{ catalog, index }` resolves to the text of that catalog's bank.
 * Throws naming the reference when the catalog or the index is unknown.
 */
export function resolveNameRef(catalog: TextCatalog, ref: { catalog: TextRefCatalog; index: number }): string {
  const bank = TEXT_REF_BANKS[ref.catalog];
  if (bank === undefined) throw new Error(`Catálogo de nome desconhecido: ${ref.catalog}`);
  const id = formatTextId(bank, ref.index);
  if (!catalog.has(id)) throw new UnknownTextError(id);
  return catalog.get(id, DEFAULT_FALLBACK).text;
}
