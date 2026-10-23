import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type GameDataCodec, writeGameDataFile } from "../../src/data/write.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-write-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// A hand-made codec: valid when `value.valid` is true. The real one is covered in `shared`.
const codec: GameDataCodec<"widgets"> = {
  parseGameDataFile: (_kind, value, file) =>
    (value as { valid?: boolean }).valid
      ? { ok: true, data: value }
      : { ok: false, error: { file, path: "records.0.size", problem: "esperado valor ≤ 10" } },
  serializeGameDataFile: (_kind, data) => `${JSON.stringify(data)}\n`,
};

describe("writeGameDataFile", () => {
  it("writes the serialized text", async () => {
    await writeGameDataFile(dir, "widgets", { valid: true, n: 1 }, "widgets.json", codec);
    expect(await readFile(join(dir, "widgets.json"), "utf8")).toBe('{"valid":true,"n":1}\n');
  });

  it("creates the folder when it does not exist", async () => {
    const nested = join(dir, "json", "deeper");
    await writeGameDataFile(nested, "widgets", { valid: true }, "widgets.json", codec);
    expect(await readdir(nested)).toEqual(["widgets.json"]);
  });

  it("throws naming the file, the field path and the problem, and writes nothing", async () => {
    const attempt = writeGameDataFile(dir, "widgets", { valid: false }, "widgets.json", codec);
    await expect(attempt).rejects.toThrow(/widgets\.json/);
    await expect(attempt).rejects.toThrow(/records\.0\.size/);
    await expect(attempt).rejects.toThrow(/esperado valor ≤ 10/);
    expect(await readdir(dir)).toEqual([]);
  });
});
