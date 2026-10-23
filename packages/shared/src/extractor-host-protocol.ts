import type { AssetsFailure } from "./assets-state";
import type { RomRegion, RomRejection, RomValidationResult } from "./rom-validation";

// See specs/003-rom-extraction-pipeline/contracts/extractor-host-protocol.md.

export type MainToExtractorMessage =
  | { type: "validate-and-copy"; sourcePath: string; romCopyPath: string; logPath: string }
  | { type: "extract"; romCopyPath: string; workspaceDir: string; logPath: string; appVersion: string }
  | { type: "cancel" };

export type ExtractorToMainMessage =
  | { type: "validated"; result: RomValidationResult }
  | { type: "copied" }
  | { type: "progress"; stageTitle: string; percent: number }
  | { type: "completed" }
  | { type: "cancelled" }
  | { type: "rom-copy-invalid" }
  | { type: "failed"; failure: AssetsFailure };

type Fields = Record<string, unknown>;

const REGIONS: ReadonlySet<string> = new Set<RomRegion>([
  "usa", "japan", "korea", "europe", "france", "germany", "italy", "spain", "unknown",
]);

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRegion(value: unknown): value is RomRegion {
  return typeof value === "string" && REGIONS.has(value);
}

function isRomRejection(value: unknown): value is RomRejection {
  if (!isRecord(value)) return false;
  switch (value["reason"]) {
    case "unreadable":
    case "not-ds-rom":
    case "modified":
      return true;
    case "archive":
      return value["format"] === "zip" || value["format"] === "7z" || value["format"] === "rar";
    case "other-game":
      return typeof value["title"] === "string" && isNonEmptyString(value["gameCode"]);
    case "heartgold":
      return isRegion(value["region"]);
    case "other-region":
      return isRegion(value["region"]) && isNonEmptyString(value["gameCode"]);
    default:
      return false;
  }
}

function isRomValidationResult(value: unknown): value is RomValidationResult {
  if (!isRecord(value)) return false;
  if (value["ok"] === true) {
    return typeof value["sha1"] === "string" && /^[0-9a-f]{40}$/.test(value["sha1"]) && isCount(value["size"]);
  }
  return value["ok"] === false && isRomRejection(value["rejection"]);
}

function isAssetsFailure(value: unknown): value is AssetsFailure {
  if (!isRecord(value)) return false;
  switch (value["code"]) {
    case "disk-full":
      return isCount(value["requiredBytes"]) && isCount(value["availableBytes"]);
    case "write-permission":
      return isNonEmptyString(value["path"]);
    case "stage-failed":
      return isNonEmptyString(value["stageTitle"]);
    case "busy":
    case "rom-copy-failed":
    case "unexpected":
      return true;
    default:
      return false;
  }
}

export function isMainToExtractorMessage(value: unknown): value is MainToExtractorMessage {
  if (!isRecord(value)) return false;
  switch (value["type"]) {
    case "validate-and-copy":
      return (
        isNonEmptyString(value["sourcePath"]) &&
        isNonEmptyString(value["romCopyPath"]) &&
        isNonEmptyString(value["logPath"])
      );
    case "extract":
      return (
        isNonEmptyString(value["romCopyPath"]) &&
        isNonEmptyString(value["workspaceDir"]) &&
        isNonEmptyString(value["logPath"]) &&
        isNonEmptyString(value["appVersion"])
      );
    case "cancel":
      return true;
    default:
      return false;
  }
}

export function isExtractorToMainMessage(value: unknown): value is ExtractorToMainMessage {
  if (!isRecord(value)) return false;
  switch (value["type"]) {
    case "validated":
      return isRomValidationResult(value["result"]);
    case "progress":
      return (
        isNonEmptyString(value["stageTitle"]) && isCount(value["percent"]) && value["percent"] <= 100
      );
    case "failed":
      return isAssetsFailure(value["failure"]);
    case "copied":
    case "completed":
    case "cancelled":
    case "rom-copy-invalid":
      return true;
    default:
      return false;
  }
}
