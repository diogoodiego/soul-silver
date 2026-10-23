import type { RomRejection } from "./rom-validation";

/** See specs/003-rom-extraction-pipeline/data-model.md, "Estado dos assets no app". */
export type ExtractionMode = "first-run" | "update" | "repair" | "resume";

export type AssetsFailure =
  | { code: "disk-full"; requiredBytes: number; availableBytes: number }
  | { code: "write-permission"; path: string }
  | { code: "busy" }
  | { code: "rom-copy-failed" }
  | { code: "stage-failed"; stageTitle: string }
  | { code: "unexpected" };

export type AssetsState =
  | { status: "checking" }
  | { status: "needs-rom"; savedRom: boolean; previousRomInvalid: boolean }
  | { status: "validating" }
  | { status: "rejected"; rejection: RomRejection }
  /** percent: 0–100, never decreases within one extraction. */
  | { status: "extracting"; mode: ExtractionMode; stageTitle: string; percent: number }
  | { status: "cancelling" }
  | { status: "failed"; failure: AssetsFailure }
  | { status: "ready" };
