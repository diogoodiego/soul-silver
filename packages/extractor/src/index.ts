// Public API; see specs/003-rom-extraction-pipeline/contracts/extractor-library-api.md and
// specs/004-game-data-extraction/contracts/.
export { decompressBlz, BlzFormatError } from "./data/blz.ts";
export { type DataLayout, SOULSILVER_US_LAYOUT } from "./data/layout.ts";
export {
  buildSanityReport,
  EXPECTED_COUNTS,
  type ExpectedCounts,
  formatSanityReport,
  type SanityReport,
} from "./data/report.ts";
export { createDataStages } from "./data/stages.ts";
export { createConsoleLogger, createFileLogger, type Logger } from "./log.ts";
export { type NdsFile, type NdsFileSystem, type NdsOverlay, readNdsFileSystem } from "./nds/filesystem.ts";
export { NdsFormatError, type NdsHeader, parseNdsHeader } from "./nds/header.ts";
export { isNarc, type Narc, NarcFormatError, parseNarc } from "./nds/narc.ts";
export { type AssetsCheck, checkAssets, type OutputMismatch, verifyOutputs } from "./pipeline/check.ts";
export type { Manifest, OutputRecord, StageRecord } from "./pipeline/manifest.ts";
export type { PlannedStage, RunReason } from "./pipeline/plan.ts";
export { createRegistry, type Registry, StageRegistryError } from "./pipeline/registry.ts";
export { type PipelineError, type RunArgs, runPipeline, type RunProgress, type RunResult } from "./pipeline/run.ts";
export type { Stage, StageContext, StageInput } from "./pipeline/stage.ts";
export { copyRom } from "./rom/copy.ts";
export { REFERENCE_ROM_SHA1 } from "./rom/reference.ts";
export { sha1File, validateRom } from "./rom/validate.ts";
export { codeDecompressStage } from "./stages/code-decompress.ts";
export { defaultStages } from "./stages/index.ts";
export { textCatalogStage } from "./text/stage.ts";
export { BankFormatError, decodeBank, encodeBank, type Bank, type BankEntry } from "./text/bank.ts";
export { markupToWords, wordsToMarkup, type MarkupResult, type UnknownUse } from "./text/words.ts";
export { loadTextCatalog, loadTranslatedCatalog } from "./text/catalog-files.ts";
export { findTexts, searchKey, type FoundText } from "./text/find.ts";
export { buildTextReport, EXPECTED_TEXT_COUNTS, type NameRef, type TextReportResult } from "./text/report.ts";
export { MAP_ARCHIVES, mapsStage } from "./maps/stage.ts";
export { buildMapReport, MIN_MAPS_WITHOUT_FAILURE, type MapReportResult } from "./maps/report.ts";
