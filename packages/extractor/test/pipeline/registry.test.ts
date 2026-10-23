import { describe, expect, it } from "vitest";
import { createRegistry, StageRegistryError } from "../../src/pipeline/registry.ts";
import { fakeStage } from "./fake-stage.ts";

describe("createRegistry", () => {
  it("orders stages topologically, breaking ties by registration order", () => {
    const registry = createRegistry([
      fakeStage("c", { dependsOn: ["b"] }),
      fakeStage("d"),
      fakeStage("b", { dependsOn: ["a"] }),
      fakeStage("a"),
    ]);
    expect(registry.stages.map((s) => s.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("looks stages up and reports direct dependencies and transitive dependents", () => {
    const registry = createRegistry([
      fakeStage("a"),
      fakeStage("b", { dependsOn: ["a"] }),
      fakeStage("c", { dependsOn: ["b"] }),
      fakeStage("d"),
    ]);
    expect(registry.get("b")?.id).toBe("b");
    expect(registry.get("zzz")).toBeUndefined();
    expect(registry.dependenciesOf("c")).toEqual(["b"]);
    expect(registry.dependentsOf("a")).toEqual(["b", "c"]);
    expect(registry.dependentsOf("d")).toEqual([]);
  });

  it.each([
    ["duplicate id", () => [fakeStage("a"), fakeStage("a")], /a/],
    ["non-integer version", () => [fakeStage("a", { version: 1.5 })], /a.*version/],
    ["version below 1", () => [fakeStage("a", { version: 0 })], /a.*version/],
    ["non-positive weight", () => [fakeStage("a", { weight: 0 })], /a.*weight/],
    ["no outputs", () => [fakeStage("a", { outputs: [] })], /a.*output/],
    ["repeated output", () => [fakeStage("a", { outputs: ["x", "x"] })], /a.*output/],
    ["unknown input stage", () => [fakeStage("a", { dependsOn: ["ghost"] })], /a.*ghost/],
    ["cycle", () => [fakeStage("a", { dependsOn: ["b"] }), fakeStage("b", { dependsOn: ["a"] })], /cycle/],
  ])("rejects %s", (_name, stages, message) => {
    expect(() => createRegistry(stages())).toThrow(StageRegistryError);
    expect(() => createRegistry(stages())).toThrow(message);
  });

  it("rejects an input pointing to an unknown output", () => {
    const b = fakeStage("b");
    const stages = [fakeStage("a", { outputs: ["x"] }), { ...b, inputs: [{ kind: "stage" as const, stage: "a", output: "nope" }] }];
    expect(() => createRegistry(stages)).toThrow(/b.*nope/);
  });
});
