import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname } from "node:path";

// See specs/003-rom-extraction-pipeline/research.md R13.

export interface Logger {
  info(message: string, stageId?: string): void;
  warn(message: string, stageId?: string): void;
  error(message: string, error?: unknown, stageId?: string): void;
}

type Level = "INFO" | "WARN" | "ERROR";

/** Never lets binary data (e.g. ROM bytes) reach the log (FR-027). */
export function describeError(error: unknown): string {
  if (error instanceof Uint8Array) return `<binary ${error.length} bytes>`;
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    const head = code === undefined ? "" : `[${code}] `;
    return `${head}${error.stack ?? `${error.name}: ${error.message}`}`;
  }
  return String(error);
}

function text(message: unknown): string {
  return typeof message === "string" ? message : describeError(message);
}

export function formatLine(level: Level, message: string, stageId?: string): string {
  const stage = stageId === undefined ? "" : ` [${stageId}]`;
  return `${new Date().toISOString()} ${level}${stage} ${text(message)}`;
}

function createLogger(write: (line: string) => void): Logger {
  return {
    info: (message, stageId) => write(formatLine("INFO", message, stageId)),
    warn: (message, stageId) => write(formatLine("WARN", message, stageId)),
    error: (message, error, stageId) => {
      const detail = error === undefined ? "" : ` | ${describeError(error)}`;
      write(formatLine("ERROR", `${text(message)}${detail}`, stageId));
    },
  };
}

export function createConsoleLogger(write: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): Logger {
  return createLogger(write);
}

/**
 * Appends to a text file the player can open and send. Writes are synchronous so
 * the last lines survive a crash; past `maxBytes` the file becomes `<name>.1.log`.
 */
export function createFileLogger(path: string, options: { maxBytes?: number } = {}): Logger {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const backup = path.replace(/(\.log)?$/, ".1.log");
  mkdirSync(dirname(path), { recursive: true });
  let size = 0;
  try {
    size = statSync(path).size;
  } catch {
    size = 0;
  }
  return createLogger((line) => {
    const entry = `${line}\n`;
    const bytes = Buffer.byteLength(entry);
    if (size > 0 && size + bytes > maxBytes) {
      renameSync(path, backup);
      size = 0;
    }
    appendFileSync(path, entry);
    size += bytes;
  });
}
