// The text catalog stage: decodes every message bank, writes the English catalog and proves the
// round trip. See specs/005-text-catalog/contracts/stage-and-cli.md.
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  GAME_TEXT_FORMAT_VERSION,
  serializeTextFile,
  TEXT_BANK_NAMES,
  type TextBankFile,
  type TextIndexFile,
  type TextRecord,
  type TextReportFile,
} from "@soulsilver/shared/text";
import { listNarcIndices, NARC_INPUT, readNarcMember } from "../data/inputs.ts";
import type { Stage, StageContext } from "../pipeline/stage.ts";
import { type Bank, type BankEntry, decodeBank, encodeBank } from "./bank.ts";
import { markupToWords, type UnknownUse, wordsToMarkup } from "./words.ts";

const MIB = 1024 * 1024;
const MESSAGE_NARC = "a/0/2/7";

interface BankResult {
  file: TextBankFile;
  unknown: UnknownUse[];
  identical: boolean;
}

/** Converts one decoded bank to a text-bank file and checks that recoding gives the same bytes. */
function convert(bankNumber: number, bytes: Uint8Array): BankResult {
  const bank: Bank = decodeBank(bytes);
  const unknown: UnknownUse[] = [];
  const records: TextRecord[] = bank.entries.map((entry: BankEntry, id) => {
    const converted = wordsToMarkup(entry.words);
    unknown.push(...converted.unknown);
    if (!entry.compressed) return { id, text: converted.text };
    return entry.terminated
      ? { id, text: converted.text, compressed: true }
      : { id, text: converted.text, compressed: true, unterminated: true };
  });
  const file: TextBankFile = {
    kind: "text-bank",
    formatVersion: GAME_TEXT_FORMAT_VERSION,
    language: "en",
    bank: bankNumber,
    name: TEXT_BANK_NAMES[bankNumber] ?? null,
    records,
  };

  // Recode from the catalog's own records, as a reader would, and compare with the original bytes.
  const recoded: Bank = {
    seed: bank.seed,
    entries: records.map((record) => ({
      compressed: record.compressed === true,
      terminated: record.unterminated !== true,
      words: markupToWords(record.text),
    })),
  };
  const identical = Buffer.compare(Buffer.from(encodeBank(recoded)), Buffer.from(bytes)) === 0;
  return { file, unknown, identical };
}

export const textCatalogStage: Stage = {
  id: "text-catalog",
  title: "Convertendo os textos",
  version: 1,
  weight: 3,
  inputs: [NARC_INPUT],
  outputs: ["catalog"],
  estimateBytes: () => 40 * MIB,
  run: async (ctx: StageContext) => {
    const catalog = ctx.outputDir("catalog");
    const english = join(catalog, "en");
    await mkdir(english, { recursive: true });

    const banks = await listNarcIndices(ctx, MESSAGE_NARC);
    const count = banks.length;
    const index: TextIndexFile["records"] = [];
    const report = { texts: 0, compressed: 0, named: 0, characters: new Map<number, { count: number; banks: Set<number> }>(), commands: new Map<string, { command: number; count: number; params: number }>(), identical: 0 };

    for (const [done, bank] of banks.entries()) {
      ctx.signal.throwIfAborted();
      const bytes = await readNarcMember(ctx, MESSAGE_NARC, bank);
      let result: BankResult;
      try {
        result = convert(bank, bytes);
      } catch (error) {
        throw new Error(`Banco ${String(bank).padStart(4, "0")}: ${(error as Error).message}`, { cause: error });
      }
      if (!result.identical) {
        throw new Error(`Banco ${String(bank).padStart(4, "0")}: a recodificação não reproduz o binário original`);
      }

      const { file } = result;
      const path = join(english, `${String(bank).padStart(4, "0")}.json`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, serializeTextFile("text-bank", file));

      index.push({ id: bank, name: file.name, count: file.records.length });
      report.texts += file.records.length;
      report.compressed += file.records.filter((r) => r.compressed).length;
      if (file.name !== null) report.named += 1;
      report.identical += 1;
      for (const use of result.unknown) {
        if (use.kind === "character") {
          const entry = report.characters.get(use.code) ?? { count: 0, banks: new Set<number>() };
          entry.count += 1;
          entry.banks.add(bank);
          report.characters.set(use.code, entry);
        } else {
          const key = `${use.command}:${use.params}`;
          const entry = report.commands.get(key) ?? { command: use.command, count: 0, params: use.params };
          entry.count += 1;
          report.commands.set(key, entry);
        }
      }
      ctx.progress((done + 1) / count);
    }

    const indexFile: TextIndexFile = { kind: "text-index", formatVersion: GAME_TEXT_FORMAT_VERSION, language: "en", records: index };
    await writeFile(join(catalog, "index.json"), serializeTextFile("text-index", indexFile));

    const reportFile = {
      kind: "text-report",
      formatVersion: GAME_TEXT_FORMAT_VERSION,
      records: [],
      banks: count,
      texts: report.texts,
      namedBanks: report.named,
      compressedTexts: report.compressed,
      unknownCharacters: [...report.characters].map(([code, v]) => ({ code, count: v.count, banks: [...v.banks].sort((a, b) => a - b) })),
      unknownCommands: [...report.commands.values()],
      roundTrip: { banks: count, identical: report.identical },
    } as unknown as TextReportFile;
    await writeFile(join(catalog, "report.json"), serializeTextFile("text-report", reportFile));
  },
};
