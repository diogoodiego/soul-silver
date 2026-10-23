import { join } from "node:path";

// Layout of the extraction workspace; see data-model.md, "Área de trabalho".

export const STAGING_DIR = "staging";
export const STAGES_DIR = "stages";

export function stageDir(workspaceDir: string, stageId: string): string {
  return join(workspaceDir, STAGES_DIR, stageId);
}

export function outputDir(workspaceDir: string, stageId: string, output: string): string {
  return join(stageDir(workspaceDir, stageId), output);
}
