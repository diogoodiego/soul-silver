import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Stage, StageContext } from "../../src/pipeline/stage.ts";

export interface FakeStageOptions {
  version?: number;
  weight?: number;
  dependsOn?: readonly string[];
  outputs?: readonly string[];
  filesPerOutput?: number;
  /** Called between files, e.g. to simulate a crash mid-stage. */
  onFile?: (ctx: StageContext, index: number) => void | Promise<void>;
  run?: (ctx: StageContext) => Promise<void>;
}

/**
 * A stage that writes small deterministic files into each output. Inputs are the
 * first output of every stage in `dependsOn`.
 */
export function fakeStage(id: string, options: FakeStageOptions = {}): Stage & { runs: number } {
  const outputs = options.outputs ?? ["out"];
  const filesPerOutput = options.filesPerOutput ?? 2;
  const stage = {
    id,
    title: `Stage ${id}`,
    version: options.version ?? 1,
    weight: options.weight ?? 1,
    inputs: (options.dependsOn ?? []).map((dep) => ({ kind: "stage" as const, stage: dep, output: "out" })),
    outputs,
    estimateBytes: () => 1024,
    runs: 0,
    async run(ctx: StageContext) {
      stage.runs++;
      if (options.run) return options.run(ctx);
      let index = 0;
      const total = outputs.length * filesPerOutput;
      for (const output of outputs) {
        for (let i = 0; i < filesPerOutput; i++) {
          ctx.signal.throwIfAborted();
          await options.onFile?.(ctx, index);
          await writeFile(join(ctx.outputDir(output), `${i}.bin`), `${id}:${output}:${i}:v${stage.version}`);
          index++;
          ctx.progress(index / total);
        }
      }
    },
  };
  return stage;
}
