import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseGameDataFile, serializeGameDataFile } from "@soulsilver/shared/game-data";
import { writeFileAtomic } from "../fs-atomic.ts";

/** What `writeGameDataFile` needs from the schema module; the real one is the shared module. */
export interface GameDataCodec<K extends string> {
  parseGameDataFile(kind: K, value: unknown, file: string): { ok: true; data: unknown } | { ok: false; error: { file: string; path: string; problem: string } };
  serializeGameDataFile(kind: K, data: never): string;
}

const sharedCodec: GameDataCodec<string> = {
  parseGameDataFile: (kind, value, file) => parseGameDataFile(kind as never, value, file),
  serializeGameDataFile: (kind, data) => serializeGameDataFile(kind as never, data),
};

/**
 * Validates `data` against its schema and writes it deterministically (FR-013, R13).
 * An invalid record fails the stage with the file, field path and problem; nothing is written.
 */
export async function writeGameDataFile<K extends string>(
  dir: string,
  kind: K,
  data: unknown,
  fileName: string,
  codec: GameDataCodec<K> = sharedCodec,
): Promise<void> {
  const result = codec.parseGameDataFile(kind, data, fileName);
  if (!result.ok) {
    const { file, path, problem } = result.error;
    throw new Error(`Arquivo de dados inválido: ${file} (campo "${path}"): ${problem}`);
  }
  await mkdir(dir, { recursive: true });
  await writeFileAtomic(join(dir, fileName), codec.serializeGameDataFile(kind, result.data as never));
}
