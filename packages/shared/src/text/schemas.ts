// Text files: text-bank (one per bank and language), text-index and text-report.
// See specs/005-text-catalog/data-model.md. Same envelope and codec as the game data (feature 004).
import { z } from "zod";
import { fileSchema, GAME_DATA_FORMAT_VERSION, id, int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";
import { parseMarkup } from "./markup.ts";

/** Version of the text file format; bumped when a text schema changes. */
export const GAME_TEXT_FORMAT_VERSION = GAME_DATA_FORMAT_VERSION;

const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/;

/** Text in neutral markup; invalid markup is a schema error with the position in the problem. */
const markupText = z.string().superRefine((text, ctx) => {
  try {
    parseMarkup(text);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: (error as Error).message });
  }
});

/** compressed: true when the game stored the text packed (0xF100); needed to recode the bank exactly. */
const textRecord = z.strictObject({
  id: id(),
  text: markupText,
  compressed: z.literal(true).optional(),
  /** Compressed text without the 0x1FF end (ends at a word boundary). Only with compressed. */
  unterminated: z.literal(true).optional(),
});

export const textBankFile = fileSchema("text-bank", textRecord, {
  language: z.string().regex(LANGUAGE, "esperado código de idioma (ex.: en, pt-BR)"),
  bank: int(0, 9999),
  name: z.string().nullable(),
});
export type TextBankFile = z.infer<typeof textBankFile>;
export type TextRecord = z.infer<typeof textRecord>;

export const textIndexFile = fileSchema(
  "text-index",
  z.strictObject({ id: int(0, 9999), name: z.string().nullable(), count: id() }),
  { language: z.literal("en") },
);
export type TextIndexFile = z.infer<typeof textIndexFile>;

export const textReportFile = fileSchema(
  "text-report",
  z.never(),
  {
    banks: id(),
    texts: id(),
    namedBanks: id(),
    compressedTexts: id(),
    unknownCharacters: z.array(z.strictObject({ code: int(0, 65535), count: id(), banks: z.array(int(0, 9999)) })),
    unknownCommands: z.array(z.strictObject({ command: int(0, 65535), count: id(), params: id() })),
    roundTrip: z.strictObject({ banks: id(), identical: id() }),
  },
);
export type TextReportFile = z.infer<typeof textReportFile>;

const codec = createGameDataCodec({
  "text-bank": textBankFile,
  "text-index": textIndexFile,
  "text-report": textReportFile,
});

export type TextFileKind = "text-bank" | "text-index" | "text-report";
export const parseTextFile = codec.parseGameDataFile;
export const parseTextJson = codec.parseGameDataJson;
export const serializeTextFile = codec.serializeGameDataFile;
