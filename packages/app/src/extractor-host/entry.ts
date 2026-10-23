// Entry point of the extractor utility process. Adapts Electron's parentPort to the
// pure @soulsilver/extractor library; one process per task (contracts/extractor-host-protocol.md).
import type {} from "electron";
import { stat } from "node:fs/promises";
import {
  copyRom,
  createConsoleLogger,
  createFileLogger,
  createRegistry,
  defaultStages,
  type Logger,
  runPipeline,
  validateRom,
} from "@soulsilver/extractor";
import { type ExtractorToMainMessage, isMainToExtractorMessage, type MainToExtractorMessage } from "@soulsilver/shared";

const PROGRESS_INTERVAL_MS = 100;

const port = process.parentPort;
const abort = new AbortController();
let running = false;

function send(msg: ExtractorToMainMessage): void {
  port.postMessage(msg);
}

/** Sends the task's final message and exits, leaving time for the message to flush. */
function finish(msg: ExtractorToMainMessage): void {
  send(msg);
  setTimeout(() => process.exit(0), 100);
}

async function validateAndCopy(msg: Extract<MainToExtractorMessage, { type: "validate-and-copy" }>, log: Logger) {
  const result = await validateRom(msg.sourcePath, { signal: abort.signal });
  log.info(result.ok ? `ROM accepted (SHA-1 ${result.sha1})` : `ROM rejected: ${result.rejection.reason}`);
  if (!result.ok) {
    finish({ type: "validated", result });
    return;
  }
  send({ type: "validated", result });
  try {
    await copyRom(msg.sourcePath, msg.romCopyPath, result.sha1, abort.signal);
    finish({ type: "copied" });
  } catch (error) {
    if (abort.signal.aborted) return finish({ type: "cancelled" });
    log.error("Could not copy the ROM", error);
    finish({ type: "failed", failure: { code: "rom-copy-failed" } });
  }
}

async function extract(msg: Extract<MainToExtractorMessage, { type: "extract" }>, log: Logger) {
  try {
    await stat(msg.romCopyPath);
  } catch {
    log.warn("Saved ROM copy is missing");
    return finish({ type: "rom-copy-invalid" });
  }
  const registry = createRegistry(defaultStages);
  let lastSent = 0;
  const result = await runPipeline({
    workspaceDir: msg.workspaceDir,
    romPath: msg.romCopyPath,
    registry,
    signal: abort.signal,
    log,
    appVersion: msg.appVersion,
    onPlan: (plan) => log.info(`Plan: ${plan.map((p) => `${p.stage.id} (${p.reason})`).join(", ") || "nothing to do"}`),
    onProgress: ({ stageTitle, percent }) => {
      const now = Date.now();
      if (percent < 100 && now - lastSent < PROGRESS_INTERVAL_MS) return;
      lastSent = now;
      send({ type: "progress", stageTitle, percent });
    },
  });
  switch (result.status) {
    case "completed":
      return finish({ type: "completed" });
    case "cancelled":
      return finish({ type: "cancelled" });
    case "failed": {
      const { error } = result;
      if (error.code === "rom-mismatch") return finish({ type: "rom-copy-invalid" });
      if (error.code === "stage-failed") {
        return finish({ type: "failed", failure: { code: "stage-failed", stageTitle: registry.get(error.stageId)?.title ?? error.stageId } });
      }
      return finish({ type: "failed", failure: error });
    }
  }
}

port.on("message", (event) => {
  const msg: unknown = event.data;
  if (!isMainToExtractorMessage(msg)) {
    console.warn(`[extractor-host] Discarded invalid message: ${JSON.stringify(msg)}`);
    return;
  }
  if (msg.type === "cancel") {
    abort.abort();
    return;
  }
  if (running) return;
  running = true;
  let log: Logger;
  try {
    log = createFileLogger(msg.logPath);
  } catch (error) {
    // The log is for support only; never let it block the extraction.
    log = createConsoleLogger();
    log.warn(`Cannot open ${msg.logPath}: ${String(error)}`);
  }
  const task = msg.type === "extract" ? extract(msg, log) : validateAndCopy(msg, log);
  task.catch((error: unknown) => {
    if (abort.signal.aborted) return finish({ type: "cancelled" });
    log.error("Unexpected extractor error", error);
    finish({ type: "failed", failure: { code: "unexpected" } });
  });
});
