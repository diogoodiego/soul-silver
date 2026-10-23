// Public API; see specs/003-rom-extraction-pipeline/contracts/extractor-library-api.md.
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
export { defaultStages } from "./stages/index.ts";
