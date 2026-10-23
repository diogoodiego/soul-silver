import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { OutputRecord } from "./manifest.ts";

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

/**
 * Deterministic digest of a folder (research R8): SHA-256 over sorted
 * `<path>\0<size>\0<sha256>\n` lines, paths POSIX and sorted by UTF-8 bytes.
 */
export async function digestTree(dir: string): Promise<OutputRecord> {
  const paths = (await listFiles(dir)).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const tree = createHash("sha256");
  let bytes = 0;
  for (const path of paths) {
    const full = join(dir, path);
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of createReadStream(full)) {
      hash.update(chunk as Buffer);
      size += (chunk as Buffer).length;
    }
    bytes += size;
    tree.update(`${path}\0${size}\0${hash.digest("hex")}\n`);
  }
  return { sha256: tree.digest("hex"), files: paths.length, bytes };
}

/** Fast existence check (research R9): recursive readdir, no stat. Undefined if the folder is missing. */
export async function countFiles(dir: string): Promise<number | undefined> {
  try {
    return (await listFiles(dir)).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
