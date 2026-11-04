// The golden path's report (spec 024 US6, contracts/golden-path.md).
import type { ServerMessage } from "@soulsilver/shared/game";
import type { Save } from "@soulsilver/shared/save";
import { hex, type Milestone } from "./milestones";

type Trigger = Extract<ServerMessage, { type: "script-debug" }>["triggers"][number];

export interface Failure {
  milestone: Milestone;
  check: string;
  /** "file:entry" of the last script that ran; null when none did. */
  lastScript: string | null;
  position: { map: string; tx: number; ty: number };
  /** The map's scripts and triggers as the debugger shows them (research R6). */
  triggers: Trigger[];
  save: Save;
}

/** A check of specs 020–023 on the real extraction; `failed` says what did not hold. */
export interface Check {
  name: string;
  failed?: string | undefined;
}

const line = (m: Milestone) => `ok  ${m.n}. ${m.name}`;

/** The field probe's report (spec 025): one line per obstacle, then the total. */
export function fieldReport(checks: Check[]): string {
  const out = checks.map((c) => (c.failed ? `FALHOU ${c.name}: ${c.failed}` : `ok  ${c.name}`));
  out.push(`${checks.filter((c) => !c.failed).length} de ${checks.length} obstáculos`);
  return out.join("\n");
}

/** Unhandled commands the stretch's maps use and the run never hit, sorted: optional content, reported apart. */
export function optionalMissing(commands: { name: string; maps: number[] }[], maps: Set<number>, handled: (name: string) => boolean, hit: Set<string>): string[] {
  return commands
    .filter((c) => !handled(c.name) && !hit.has(c.name) && c.maps.some((m) => maps.has(m)))
    .map((c) => c.name)
    .sort();
}

/**
 * One line per milestone reached and the total; on a failure, what is needed to see why. Then the checks of
 * specs 020–023 and the optional commands still missing, which do not fail the run.
 */
export function report(reached: Milestone[], total: number, failure?: Failure, extra: { checks?: Check[]; optional?: string[] } = {}): string {
  const out = reached.map(line);
  if (failure) {
    const { milestone: m, save } = failure;
    out.push(`FALHOU ${m.n}. ${m.name}: ${failure.check}`);
    out.push(`  último script: ${failure.lastScript ?? "nenhum"}`);
    out.push(`  posição: mapa ${failure.position.map}, tile (${failure.position.tx}, ${failure.position.ty})`);
    out.push("  condições do mapa:");
    for (const t of failure.triggers) out.push(`    ${t.kind} ${t.script}: ${t.condition} (${t.met ? "sim" : "não"})`);
    const flags = (m.checks.flags ?? []).map((f) => `${f} ${save.flags.includes(f) ? "ligada" : "desligada"}`);
    const vars = Object.keys(m.checks.vars ?? {}).map((id) => `${hex(Number(id))} = ${save.vars[id] ?? 0}`);
    if (flags.length) out.push(`  flags: ${flags.join(", ")}`);
    if (vars.length) out.push(`  vars: ${vars.join(", ")}`);
  }
  out.push(`${reached.length} de ${total} marcos`);
  const { checks = [], optional = [] } = extra;
  if (checks.length) {
    for (const c of checks) out.push(c.failed ? `FALHOU ${c.name}: ${c.failed}` : `ok  ${c.name}`);
    out.push(`${checks.filter((c) => !c.failed).length} de ${checks.length} checks dos specs 020–023`);
  }
  if (optional.length) out.push(`comandos sem implementação fora do caminho principal (não reprovam): ${optional.join(", ")}`);
  return out.join("\n");
}
