// Reads a text catalog folder (catalog/<language>/NNNN.json) into validated text-bank files.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseTextJson, type TextBankFile, validateTranslation } from "@soulsilver/shared/text";

const BANK_FILE = /^\d{4}\.json$/;

export async function loadTextCatalog(catalogDir: string, language: string): Promise<TextBankFile[]> {
  const folder = join(catalogDir, language);
  let names: string[];
  try {
    names = await readdir(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const banks: TextBankFile[] = [];
  for (const name of names.filter((n) => BANK_FILE.test(n)).sort()) {
    const text = await readFile(join(folder, name), "utf8");
    const result = parseTextJson("text-bank", text, name);
    if (!result.ok) {
      const { file, path, problem } = result.error;
      throw new Error(`${file} (campo "${path}"): ${problem}`);
    }
    banks.push(result.data);
  }
  return banks.sort((a, b) => a.bank - b.bank);
}

/**
 * A translated catalog: the banks of `language` (a subset of English) checked against English.
 * A translation cannot add texts English does not have, and cannot change the variables of a text.
 */
export async function loadTranslatedCatalog(catalogDir: string, language: string, english: readonly TextBankFile[]): Promise<TextBankFile[]> {
  const banks = await loadTextCatalog(catalogDir, language);
  const known = new Map(english.map((b) => [b.bank, new Set(b.records.map((r) => r.id))]));
  for (const file of banks) {
    if (file.language !== language) throw new Error(`${language}/${String(file.bank).padStart(4, "0")}.json: language "${file.language}" não confere com a pasta`);
    const ids = known.get(file.bank);
    for (const record of file.records) {
      if (!ids?.has(record.id)) throw new Error(`${language}/${String(file.bank).padStart(4, "0")}.json: texto ${file.bank}:${record.id} não existe no inglês`);
    }
  }
  const problems = validateTranslation(english, banks);
  if (problems.length > 0) {
    const first = problems[0]!;
    throw new Error(`Tradução ${language} inválida no texto ${first.id}: variável "${first.variable}" — ${first.problem}`);
  }
  return banks;
}
