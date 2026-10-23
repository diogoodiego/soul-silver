import type { Logger } from "../log.ts";

// See specs/003-rom-extraction-pipeline/data-model.md, "Etapa".

export type StageInput = { kind: "rom" } | { kind: "stage"; stage: string; output: string };

export interface StageContext {
  /** The whole ROM, read-only. */
  rom: Uint8Array;
  /** Folder of an output this stage consumes. */
  inputDir(stage: string, output: string): string;
  /** Staging folder of one of this stage's outputs; already created. */
  outputDir(output: string): string;
  signal: AbortSignal;
  /** 0..1 within this stage. */
  progress(fraction: number): void;
  log: Logger;
}

export interface Stage {
  /** kebab-case, unique. */
  id: string;
  /** Player-facing, PT-BR. */
  title: string;
  /** Integer ≥ 1; bump whenever the outputs change. */
  version: number;
  /** Relative cost, for the overall percentage. */
  weight: number;
  inputs: readonly StageInput[];
  /** Each output becomes stages/<id>/<name>/. */
  outputs: readonly string[];
  estimateBytes(romSize: number): number;
  run(ctx: StageContext): Promise<void>;
}
