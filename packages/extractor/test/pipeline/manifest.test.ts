import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Manifest, parseManifest, readManifest, writeManifest } from "../../src/pipeline/manifest.ts";
import { memoryLogger } from "./helpers.ts";

function validManifest(): Manifest {
  return {
    formatVersion: 1,
    rom: { sha1: "a".repeat(40), size: 1024 },
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt: "2026-10-23T10:01:00.000Z",
    stages: {
      "rom-unpack": {
        version: 1,
        completedAt: "2026-10-23T10:01:00.000Z",
        outputs: { narc: { sha256: "b".repeat(64), files: 3, bytes: 99 } },
      },
    },
  };
}

/** Returns a copy of the valid manifest with the value at `path` replaced. */
function withValue(path: string, value: unknown): unknown {
  const copy = structuredClone(validManifest()) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let node = copy;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys.at(-1)!] = value;
  return copy;
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-manifest-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("parseManifest", () => {
  it("accepts a valid manifest, with or without completedAt", () => {
    expect(parseManifest(validManifest())).toEqual({ ok: true, manifest: validManifest() });
    const complete = { ...validManifest(), completedAt: "2026-10-23T10:02:00.000Z" };
    expect(parseManifest(complete)).toEqual({ ok: true, manifest: complete });
  });

  it.each<[string, unknown]>([
    ["formatVersion", 2],
    ["rom.sha1", "abc"],
    ["rom.sha1", "A".repeat(40)],
    ["rom.size", -1],
    ["createdAt", "yesterday"],
    ["completedAt", 5],
    ["stages", []],
    ["stages.rom-unpack.version", 1.5],
    ["stages.rom-unpack.completedAt", ""],
    ["stages.rom-unpack.outputs.narc.sha256", "b".repeat(63)],
    ["stages.rom-unpack.outputs.narc.files", -1],
    ["stages.rom-unpack.outputs.narc.bytes", "9"],
  ])("reports the field path for an invalid %s (%o)", (path, value) => {
    const result = parseManifest(withValue(path, value));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.path).toBe(path);
      expect(result.problem.length).toBeGreaterThan(0);
    }
  });

  it("rejects a non-object", () => {
    expect(parseManifest(null)).toMatchObject({ ok: false, path: "" });
  });
});

describe("readManifest / writeManifest", () => {
  it("round-trips atomically", async () => {
    await writeManifest(dir, validManifest());
    expect(await readdir(dir)).toEqual(["manifest.json"]);
    expect(await readManifest(dir, memoryLogger())).toEqual(validManifest());
  });

  it("returns undefined for a missing file without warning", async () => {
    const log = memoryLogger();
    expect(await readManifest(dir, log)).toBeUndefined();
    expect(log.lines).toEqual([]);
  });

  it("returns undefined and warns for invalid JSON", async () => {
    await writeFile(join(dir, "manifest.json"), "{nope");
    const log = memoryLogger();
    expect(await readManifest(dir, log)).toBeUndefined();
    expect(log.lines).toHaveLength(1);
  });

  it("returns undefined and warns with the field path for a schema failure", async () => {
    await writeFile(join(dir, "manifest.json"), JSON.stringify({ ...validManifest(), formatVersion: 9 }));
    const log = memoryLogger();
    expect(await readManifest(dir, log)).toBeUndefined();
    expect(log.lines[0]).toContain("formatVersion");
  });
});
