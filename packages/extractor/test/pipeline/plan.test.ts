import { describe, expect, it } from "vitest";
import type { Manifest, StageRecord } from "../../src/pipeline/manifest.ts";
import { planRun } from "../../src/pipeline/plan.ts";
import { createRegistry, StageRegistryError } from "../../src/pipeline/registry.ts";
import type { Stage } from "../../src/pipeline/stage.ts";
import { fakeStage } from "./fake-stage.ts";

const ROM = "1".repeat(40);

function record(version = 1): StageRecord {
  return { version, completedAt: "2026-10-23T10:00:00.000Z", outputs: { out: { sha256: "0".repeat(64), files: 2, bytes: 4 } } };
}

function manifestFor(stages: Record<string, StageRecord>, sha1 = ROM): Manifest {
  return {
    formatVersion: 1,
    rom: { sha1, size: 10 },
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt: "2026-10-23T10:00:00.000Z",
    stages,
  };
}

async function plan(stages: Stage[], manifest: Manifest | undefined, extra: { valid?: (id: string) => boolean } = {}) {
  const result = await planRun({
    registry: createRegistry(stages),
    manifest,
    romSha1: ROM,
    isOutputValid: (id) => Promise.resolve(extra.valid?.(id) ?? true),
  });
  return { ...result, summary: result.stages.map((p) => `${p.stage.id}:${p.reason}`) };
}

const abc = () => [fakeStage("a"), fakeStage("b", { dependsOn: ["a"] }), fakeStage("c", { dependsOn: ["b"] })];

describe("planRun (foundational reasons)", () => {
  it("plans every stage as missing without a manifest", async () => {
    expect((await plan(abc(), undefined)).summary).toEqual(["a:missing", "b:missing", "c:missing"]);
  });

  it("plans every stage as rom-changed when the ROM differs", async () => {
    const manifest = manifestFor({ a: record(), b: record(), c: record() }, "2".repeat(40));
    expect((await plan(abc(), manifest)).summary).toEqual(["a:rom-changed", "b:rom-changed", "c:rom-changed"]);
  });

  it("plans nothing when everything matches", async () => {
    const manifest = manifestFor({ a: record(), b: record(), c: record() });
    expect(await plan(abc(), manifest)).toMatchObject({ stages: [], removed: [] });
  });
});

describe("planRun (update reasons)", () => {
  const abcd = (versions: Partial<Record<"a" | "b" | "c" | "d", number>> = {}) => [
    fakeStage("a", { version: versions.a ?? 1 }),
    fakeStage("b", { version: versions.b ?? 1, dependsOn: ["a"] }),
    fakeStage("c", { version: versions.c ?? 1, dependsOn: ["b"] }),
    fakeStage("d", { version: versions.d ?? 1 }),
  ];
  const complete = () => manifestFor({ a: record(), b: record(), c: record(), d: record() });

  it("re-runs a stage whose version changed and its dependents only", async () => {
    expect((await plan(abcd({ b: 2 }), complete())).summary).toEqual(["b:version-changed", "c:dependency-rerun"]);
  });

  it("runs only a newly added stage", async () => {
    const stages = [...abcd(), fakeStage("e")];
    expect((await plan(stages, complete())).summary).toEqual(["e:missing"]);
  });

  it("re-runs a stage with an invalid output and its dependents", async () => {
    expect((await plan(abcd(), complete(), { valid: (id) => id !== "a" })).summary).toEqual([
      "a:output-invalid",
      "b:dependency-rerun",
      "c:dependency-rerun",
    ]);
  });

  it("reports the highest-priority reason", async () => {
    // b has a new version and also an invalid output: version-changed wins.
    expect((await plan(abcd({ b: 2 }), complete(), { valid: (id) => id !== "b" })).summary).toEqual([
      "b:version-changed",
      "c:dependency-rerun",
    ]);
  });

  it("returns stages that are no longer registered as removed", async () => {
    const manifest = manifestFor({ a: record(), b: record(), c: record(), d: record(), old: record() });
    expect(await plan(abcd(), manifest)).toMatchObject({ stages: [], removed: ["old"] });
  });

  it("does not hash outputs of stages that already run for another reason", async () => {
    const checked: string[] = [];
    await planRun({
      registry: createRegistry(abcd({ a: 2 })),
      manifest: complete(),
      romSha1: ROM,
      isOutputValid: (id) => {
        checked.push(id);
        return Promise.resolve(true);
      },
    });
    expect(checked).toEqual(["d"]);
  });
});

describe("planRun (only and force)", () => {
  const abcd = () => [
    fakeStage("a"),
    fakeStage("b", { dependsOn: ["a"] }),
    fakeStage("c", { dependsOn: ["b"] }),
    fakeStage("d"),
  ];
  const complete = () => manifestFor({ a: record(), b: record(), c: record(), d: record() });

  async function planWith(manifest: Manifest | undefined, options: { only?: string[]; force?: string[] }) {
    const result = await planRun({
      registry: createRegistry(abcd()),
      manifest,
      romSha1: ROM,
      isOutputValid: () => Promise.resolve(true),
      ...options,
    });
    return result.stages.map((p) => `${p.stage.id}:${p.reason}`);
  }

  it("limits the plan to the requested stages and the dependencies they need", async () => {
    expect(await planWith(undefined, { only: ["c"] })).toEqual(["a:missing", "b:missing", "c:missing"]);
  });

  it("does not run requested stages that are up to date", async () => {
    expect(await planWith(complete(), { only: ["c"] })).toEqual([]);
  });

  it("forces a stage and re-runs its dependents", async () => {
    expect(await planWith(complete(), { force: ["a"] })).toEqual(["a:forced", "b:dependency-rerun", "c:dependency-rerun"]);
  });

  it("forces within only", async () => {
    expect(await planWith(complete(), { only: ["b"], force: ["b"] })).toEqual(["b:forced"]);
  });

  it.each([{ only: ["zzz"] }, { force: ["zzz"] }])("rejects unknown stage ids (%o)", async (options) => {
    await expect(planWith(complete(), options)).rejects.toThrow(StageRegistryError);
  });
});
