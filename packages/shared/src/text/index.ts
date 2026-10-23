// Public API of @soulsilver/shared/text; see specs/005-text-catalog/contracts/text-api.md.
export { formatTextId, parseTextId, TEXT_BANK_NAMES, TEXT_REF_BANKS, type ParsedTextId, type TextRefCatalog } from "./ids.ts";
export { TEXT_VARIABLES, variableByCommand, variableByName, type VariableKind } from "./variables.ts";
export { MarkupError, parseMarkup, serializeMarkup, type MarkupToken } from "./markup.ts";
export { formatText, screenText, TextFormatError, textVariables, type TextValues } from "./format.ts";
export {
  GAME_TEXT_FORMAT_VERSION,
  parseTextFile,
  parseTextJson,
  serializeTextFile,
  textBankFile,
  textIndexFile,
  textReportFile,
  type TextBankFile,
  type TextFileKind,
  type TextIndexFile,
  type TextRecord,
  type TextReportFile,
} from "./schemas.ts";
export {
  createTextCatalog,
  resolveNameRef,
  UnknownTextError,
  validateTranslation,
  type TextCatalog,
  type TextLookup,
  type TranslationProblem,
} from "./catalog.ts";
