import type { AiTuning } from "./schemas.ts";

// Who to fight in a group (spec 019, research R7): damage taken, proximity and who struck first,
// with hysteresis so the target only changes when another clearly beats it.

export interface ThreatTable {
  /** Damage-driven threat, decaying over time. */
  values: Map<number, number>;
  first: number | undefined;
  current: number | undefined;
}

export const newThreat = (): ThreatTable => ({ values: new Map(), first: undefined, current: undefined });

/** `percent` is the damage as a share of the AI's max HP. */
export function addDamage(t: ThreatTable, id: number, percent: number, tuning: AiTuning): void {
  t.first ??= id;
  t.values.set(id, (t.values.get(id) ?? 0) + percent * tuning.threat.wDamage);
}

export function decayThreat(t: ThreatTable, seconds: number, tuning: AiTuning): void {
  const k = Math.pow(1 - tuning.threat.decayPerS, seconds);
  for (const [id, v] of t.values) t.values.set(id, v * k);
}

export function forget(t: ThreatTable, id: number): void {
  t.values.delete(id);
  if (t.first === id) t.first = undefined;
  if (t.current === id) t.current = undefined;
}

/** The target among `candidates` (the opponents it knows of); keeps the current one within `margin`. */
export function chooseTarget(t: ThreatTable, candidates: { id: number; distPx: number }[], sightPx: number, margin: number, tuning: AiTuning): number | undefined {
  const { wProximity, wFirst } = tuning.threat;
  const score = (c: { id: number; distPx: number }) => (t.values.get(c.id) ?? 0) + wProximity * (1 - Math.min(1, c.distPx / Math.max(1, sightPx))) + (t.first === c.id ? wFirst : 0);
  let best: { id: number; distPx: number } | undefined;
  for (const c of candidates) if (!best || score(c) > score(best) || (score(c) === score(best) && c.id < best.id)) best = c;
  const current = candidates.find((c) => c.id === t.current);
  if (best && current && score(best) <= score(current) * (1 + margin)) best = current;
  t.current = best?.id;
  return t.current;
}
