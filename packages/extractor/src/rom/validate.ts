import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import type { RomRegion, RomRejection, RomValidationResult } from "@soulsilver/shared/rom-validation";
import { checkHeaderCrcs, HEADER_CHECK_SIZE, readGameCode, readTitle } from "../nds/header.ts";
import { REFERENCE_ROM_SHA1 } from "./reference.ts";

// Check order: specs/003-rom-extraction-pipeline/research.md R3.

const MIN_ROM_SIZE = 32 * 1024;
const MAX_ROM_SIZE = 512 * 1024 * 1024;

const REGIONS: Record<string, RomRegion> = {
  E: "usa",
  J: "japan",
  K: "korea",
  P: "europe",
  F: "france",
  D: "germany",
  I: "italy",
  S: "spain",
};

const ARCHIVES: Array<{ format: "zip" | "7z" | "rar"; magic: number[] }> = [
  { format: "zip", magic: [0x50, 0x4b, 0x03, 0x04] },
  { format: "7z", magic: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { format: "rar", magic: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
];

function reject(rejection: RomRejection): RomValidationResult {
  return { ok: false, rejection };
}

/** Printable ASCII only, at most 12 characters (data-model.md). */
function sanitizeTitle(title: string): string {
  return title.replace(/[^\x20-\x7e]/g, "").slice(0, 12);
}

async function readHead(path: string, length: number): Promise<Uint8Array> {
  const handle = await open(path, "r");
  try {
    const buffer = new Uint8Array(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function sha1File(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash("sha1");
  for await (const chunk of createReadStream(path, signal ? { signal } : {})) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export interface ValidateOptions {
  /** Accepted SHA-1s; defaults to REFERENCE_ROM_SHA1. */
  references?: readonly string[];
  signal?: AbortSignal;
}

export async function validateRom(path: string, options: ValidateOptions = {}): Promise<RomValidationResult> {
  let size: number;
  let head: Uint8Array;
  try {
    const info = await stat(path);
    if (!info.isFile()) return reject({ reason: "unreadable" });
    size = info.size;
    head = await readHead(path, HEADER_CHECK_SIZE);
  } catch {
    return reject({ reason: "unreadable" });
  }

  const archive = ARCHIVES.find(({ magic }) => magic.every((byte, i) => head[i] === byte));
  if (archive) return reject({ reason: "archive", format: archive.format });
  if (size < MIN_ROM_SIZE || size > MAX_ROM_SIZE || checkHeaderCrcs(head) !== "ok") return reject({ reason: "not-ds-rom" });

  const gameCode = readGameCode(head);
  const region = REGIONS[gameCode.charAt(3)] ?? "unknown";
  if (gameCode.startsWith("IPK")) return reject({ reason: "heartgold", region });
  if (!gameCode.startsWith("IPG")) return reject({ reason: "other-game", title: sanitizeTitle(readTitle(head)), gameCode: sanitizeTitle(gameCode) || "????" });
  if (region !== "usa") return reject({ reason: "other-region", region, gameCode });

  let sha1: string;
  try {
    sha1 = await sha1File(path, options.signal);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return reject({ reason: "unreadable" });
  }
  if (!(options.references ?? REFERENCE_ROM_SHA1).includes(sha1)) return reject({ reason: "modified" });
  return { ok: true, sha1, size };
}
