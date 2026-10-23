import { describe, expect, it } from "vitest";
import { isExtractorToMainMessage, isMainToExtractorMessage } from "../src/extractor-host-protocol";

describe("isMainToExtractorMessage", () => {
  it.each([
    { type: "validate-and-copy", sourcePath: "C:\\rom.nds", romCopyPath: "C:\\data\\rom\\soulsilver.nds", logPath: "C:\\log" },
    { type: "extract", romCopyPath: "C:\\rom.nds", workspaceDir: "C:\\ws", logPath: "C:\\log", appVersion: "0.1.0" },
    { type: "cancel" },
  ])("accepts %o", (msg) => {
    expect(isMainToExtractorMessage(msg)).toBe(true);
  });

  it.each([
    null,
    "cancel",
    [],
    { type: "unknown" },
    { type: "validate-and-copy", sourcePath: "", romCopyPath: "x", logPath: "x" },
    { type: "validate-and-copy", romCopyPath: "x", logPath: "x" },
    { type: "extract", romCopyPath: "x", workspaceDir: "x", logPath: "x" },
    { type: "extract", romCopyPath: "x", workspaceDir: 3, logPath: "x", appVersion: "1" },
  ])("rejects %o", (msg) => {
    expect(isMainToExtractorMessage(msg)).toBe(false);
  });
});

describe("isExtractorToMainMessage", () => {
  it.each([
    { type: "validated", result: { ok: true, sha1: "a".repeat(40), size: 1024 } },
    { type: "validated", result: { ok: false, rejection: { reason: "modified" } } },
    { type: "validated", result: { ok: false, rejection: { reason: "archive", format: "zip" } } },
    { type: "validated", result: { ok: false, rejection: { reason: "heartgold", region: "usa" } } },
    { type: "validated", result: { ok: false, rejection: { reason: "other-region", region: "japan", gameCode: "IPGJ" } } },
    { type: "validated", result: { ok: false, rejection: { reason: "other-game", title: "", gameCode: "ABCE" } } },
    { type: "copied" },
    { type: "progress", stageTitle: "Desempacotando a ROM", percent: 0 },
    { type: "progress", stageTitle: "Desempacotando a ROM", percent: 100 },
    { type: "completed" },
    { type: "cancelled" },
    { type: "rom-copy-invalid" },
    { type: "failed", failure: { code: "disk-full", requiredBytes: 10, availableBytes: 5 } },
    { type: "failed", failure: { code: "write-permission", path: "C:\\x" } },
    { type: "failed", failure: { code: "busy" } },
    { type: "failed", failure: { code: "rom-copy-failed" } },
    { type: "failed", failure: { code: "stage-failed", stageTitle: "X" } },
    { type: "failed", failure: { code: "unexpected" } },
  ])("accepts %o", (msg) => {
    expect(isExtractorToMainMessage(msg)).toBe(true);
  });

  it.each([
    undefined,
    42,
    { type: "nope" },
    { type: "progress", stageTitle: "", percent: 10 },
    { type: "progress", stageTitle: "X", percent: -1 },
    { type: "progress", stageTitle: "X", percent: 101 },
    { type: "progress", stageTitle: "X", percent: 1.5 },
    { type: "validated", result: { ok: true, sha1: "a", size: 1 } },
    { type: "validated", result: { ok: false, rejection: { reason: "bogus" } } },
    { type: "validated", result: { ok: false, rejection: { reason: "archive", format: "tar" } } },
    { type: "validated", result: { ok: false, rejection: { reason: "heartgold", region: "mars" } } },
    { type: "failed", failure: { code: "disk-full", requiredBytes: -1, availableBytes: 0 } },
    { type: "failed", failure: { code: "write-permission", path: "" } },
    { type: "failed", failure: { code: "stage-failed" } },
    { type: "failed", failure: { code: "other" } },
  ])("rejects %o", (msg) => {
    expect(isExtractorToMainMessage(msg)).toBe(false);
  });
});
