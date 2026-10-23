import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StageContext, StageInput } from "../pipeline/stage.ts";
import { indexName } from "../stages/rom-unpack.ts";

// Readers of the outputs the data stages consume (rom-unpack and code-decompress).

export const NARC_INPUT: StageInput = { kind: "stage", stage: "rom-unpack", output: "narc" };
export const FILESYSTEM_INPUT: StageInput = { kind: "stage", stage: "rom-unpack", output: "filesystem" };
export const CODE_INPUT: StageInput = { kind: "stage", stage: "code-decompress", output: "code" };

const bytes = async (path: string) => new Uint8Array(await readFile(path));

/** One member of an unpacked NARC, by its path in the file system (e.g. "a/0/0/2") and index. */
export function readNarcMember(ctx: StageContext, narcPath: string, index: number): Promise<Uint8Array> {
  return bytes(join(ctx.inputDir("rom-unpack", "narc"), ...narcPath.split("/"), indexName(index, 1)));
}

/** A file of the original file system, by its POSIX path. */
export function readFileSystemFile(ctx: StageContext, path: string): Promise<Uint8Array> {
  return bytes(join(ctx.inputDir("rom-unpack", "filesystem"), ...path.split("/")));
}

export function readArm9(ctx: StageContext): Promise<Uint8Array> {
  return bytes(join(ctx.inputDir("code-decompress", "code"), "arm9.bin"));
}

export function readOverlay(ctx: StageContext, overlay: number): Promise<Uint8Array> {
  return bytes(join(ctx.inputDir("code-decompress", "code"), "overlay9", indexName(overlay, 1)));
}

/** Number of members of an unpacked NARC. */
export async function countNarcMembers(ctx: StageContext, narcPath: string): Promise<number> {
  return (await readdir(join(ctx.inputDir("rom-unpack", "narc"), ...narcPath.split("/")))).filter((name) => name.endsWith(".bin")).length;
}

/** Member numbers of an unpacked NARC, from the file names, in ascending order. */
export async function listNarcIndices(ctx: StageContext, narcPath: string): Promise<number[]> {
  const names = await readdir(join(ctx.inputDir("rom-unpack", "narc"), ...narcPath.split("/")));
  return names
    .map((name) => /^(\d{4,})\.bin$/.exec(name))
    .flatMap((match) => (match ? [Number(match[1])] : []))
    .sort((a, b) => a - b);
}
