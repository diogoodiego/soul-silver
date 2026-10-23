// Development search over the text catalog (research R13). Ignores case and accents, reads breaks
// as spaces, keeps variables literal.
import { screenText, type TextBankFile } from "@soulsilver/shared/text";
import { formatTextId } from "@soulsilver/shared/text";

export interface FoundText {
  id: string;
  bank: number;
  name: string | null;
  /** Text in markup, as stored in the catalog. */
  text: string;
}

const DEFAULT_LIMIT = 20;

/** Lowercase, accents removed, runs of spaces collapsed. */
export function searchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function findTexts(banks: readonly TextBankFile[], query: string, options: { limit?: number } = {}): FoundText[] {
  const needle = searchKey(query);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const results: FoundText[] = [];
  for (const file of [...banks].sort((a, b) => a.bank - b.bank)) {
    for (const record of [...file.records].sort((a, b) => a.id - b.id)) {
      if (!searchKey(screenText(record.text)).includes(needle)) continue;
      results.push({ id: formatTextId(file.bank, record.id), bank: file.bank, name: file.name, text: record.text });
      if (results.length >= limit) return results;
    }
  }
  return results;
}
