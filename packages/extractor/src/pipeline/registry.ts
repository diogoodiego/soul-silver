import type { Stage } from "./stage.ts";

export class StageRegistryError extends Error {
  override name = "StageRegistryError";
}

export interface Registry {
  /** Topological order; ties keep registration order. */
  stages: readonly Stage[];
  get(id: string): Stage | undefined;
  /** Direct dependencies, in registry order. */
  dependenciesOf(id: string): string[];
  /** Transitive dependents, in registry order. */
  dependentsOf(id: string): string[];
}

function validate(stage: Stage): void {
  const fail = (problem: string) => {
    throw new StageRegistryError(`Stage "${stage.id}": ${problem}`);
  };
  if (!Number.isInteger(stage.version) || stage.version < 1) fail(`version must be an integer ≥ 1, got ${stage.version}`);
  if (!(stage.weight > 0)) fail(`weight must be > 0, got ${stage.weight}`);
  if (stage.outputs.length === 0) fail("must declare at least one output");
  if (new Set(stage.outputs).size !== stage.outputs.length) fail("output names must be unique");
}

export function createRegistry(input: readonly Stage[]): Registry {
  const byId = new Map<string, Stage>();
  for (const stage of input) {
    if (byId.has(stage.id)) throw new StageRegistryError(`Duplicate stage id "${stage.id}"`);
    validate(stage);
    byId.set(stage.id, stage);
  }

  const deps = new Map<string, string[]>();
  for (const stage of input) {
    const direct = new Set<string>();
    for (const item of stage.inputs) {
      if (item.kind !== "stage") continue;
      const source = byId.get(item.stage);
      if (!source) throw new StageRegistryError(`Stage "${stage.id}": input stage "${item.stage}" is not registered`);
      if (!source.outputs.includes(item.output)) {
        throw new StageRegistryError(`Stage "${stage.id}": stage "${item.stage}" has no output "${item.output}"`);
      }
      direct.add(item.stage);
    }
    deps.set(stage.id, [...direct]);
  }

  // Kahn's algorithm, always taking the earliest registered ready stage.
  const ordered: Stage[] = [];
  const placed = new Set<string>();
  while (ordered.length < input.length) {
    const next = input.find((s) => !placed.has(s.id) && deps.get(s.id)!.every((d) => placed.has(d)));
    if (!next) {
      const stuck = input.filter((s) => !placed.has(s.id)).map((s) => s.id);
      throw new StageRegistryError(`Dependency cycle between stages: ${stuck.join(", ")}`);
    }
    ordered.push(next);
    placed.add(next.id);
  }
  const position = new Map(ordered.map((s, i) => [s.id, i]));
  const sortByOrder = (ids: Iterable<string>) => [...ids].sort((a, b) => position.get(a)! - position.get(b)!);

  return {
    stages: ordered,
    get: (id) => byId.get(id),
    dependenciesOf: (id) => sortByOrder(deps.get(id) ?? []),
    dependentsOf(id) {
      const found = new Set<string>();
      for (const stage of ordered) {
        if (deps.get(stage.id)!.some((d) => d === id || found.has(d))) found.add(stage.id);
      }
      return sortByOrder(found);
    },
  };
}
