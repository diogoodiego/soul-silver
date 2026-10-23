import type { Manifest, OutputRecord } from "./manifest.ts";
import { type Registry, StageRegistryError } from "./registry.ts";
import type { Stage } from "./stage.ts";

// See specs/003-rom-extraction-pipeline/data-model.md, "Plano de execução".

export type RunReason = "forced" | "rom-changed" | "missing" | "version-changed" | "output-invalid" | "dependency-rerun";

export interface PlannedStage {
  stage: Stage;
  reason: RunReason;
}

export interface PlanArgs {
  registry: Registry;
  manifest: Manifest | undefined;
  romSha1: string;
  /** Full verification (digest); only called for stages that would otherwise be skipped. */
  isOutputValid(stageId: string, output: string, record: OutputRecord): Promise<boolean>;
  /** CLI --stages: restrict the plan to these stages and the dependencies they need. */
  only?: readonly string[];
  /** CLI --force: run these stages even when up to date. */
  force?: readonly string[];
}

export interface Plan {
  /** In registry order. */
  stages: PlannedStage[];
  /** Stages in the manifest that are no longer registered. */
  removed: string[];
}

/** Reasons that need no hashing, in priority order. */
function cheapReason(stage: Stage, args: PlanArgs): RunReason | undefined {
  const { manifest } = args;
  if (manifest && manifest.rom.sha1 !== args.romSha1) return "rom-changed";
  const record = manifest?.stages[stage.id];
  if (!record) return "missing";
  if (record.version !== stage.version) return "version-changed";
  return undefined;
}

async function outputsValid(stage: Stage, args: PlanArgs): Promise<boolean> {
  const record = args.manifest!.stages[stage.id]!;
  for (const output of stage.outputs) {
    const outputRecord = record.outputs[output];
    if (!outputRecord || !(await args.isOutputValid(stage.id, output, outputRecord))) return false;
  }
  return true;
}

/** The requested stages plus everything they transitively depend on. */
function scopeOf(registry: Registry, only: readonly string[]): Set<string> {
  const scope = new Set<string>();
  const visit = (id: string) => {
    if (scope.has(id)) return;
    scope.add(id);
    for (const dep of registry.dependenciesOf(id)) visit(dep);
  };
  for (const id of only) visit(id);
  return scope;
}

export async function planRun(args: PlanArgs): Promise<Plan> {
  const { registry } = args;
  for (const id of [...(args.only ?? []), ...(args.force ?? [])]) {
    if (!registry.get(id)) throw new StageRegistryError(`Unknown stage "${id}"`);
  }
  const scope = args.only ? scopeOf(registry, args.only) : undefined;
  const forced = new Set(args.force ?? []);
  const planned = new Map<string, RunReason>();
  for (const stage of registry.stages) {
    if (scope && !scope.has(stage.id)) continue;
    let reason: RunReason | undefined = forced.has(stage.id) ? "forced" : cheapReason(stage, args);
    // A stage re-runs anyway when a dependency does, so its outputs need no hashing.
    if (!reason && registry.dependenciesOf(stage.id).some((dep) => planned.has(dep))) reason = "dependency-rerun";
    if (!reason && !(await outputsValid(stage, args))) reason = "output-invalid";
    if (reason) planned.set(stage.id, reason);
  }
  const removed = Object.keys(args.manifest?.stages ?? {}).filter((id) => !registry.get(id));
  return {
    stages: registry.stages.filter((s) => planned.has(s.id)).map((stage) => ({ stage, reason: planned.get(stage.id)! })),
    removed,
  };
}
