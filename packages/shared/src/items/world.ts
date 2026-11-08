// Items in the world (spec 027, US5 and US6): apricorn trees, Kurt, the Berry Pots and the Dowsing MCHN.
// Pure rules on the session's clock; the server keeps the state per player.

/** The day an instant falls on, in the host's local time (the DS's RTC): "2026-11-07". */
export function dayKey(at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
}

/** Whole days from `from` to `to`, by calendar day; negative when the clock went back. */
export function daysBetween(from: string, to: string): number {
  const day = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)));
  return Math.round((day(to) - day(from)) / 86_400_000);
}

/** Apricorn trees regrow once a day (AnimApricornTree): picked today means none until tomorrow. */
export function apricornReady(picked: { day: string; trees: number[] }, tree: number, today: string): boolean {
  return picked.day !== today || !picked.trees.includes(tree);
}

/** Kurt's balls are ready once `kurtDays` have passed since he took the apricorns. */
export const kurtReady = (given: string, today: string, kurtDays: number) => daysBetween(given, today) >= kurtDays;

export const BERRY_STAGES = ["planted", "sprouted", "growing", "blooming", "ripe"] as const;
export type BerryStage = (typeof BERRY_STAGES)[number];

/**
 * A Berry Pot plant `ms` after planting, with `hoursPerStage` from the berry data (a/0/6/6): four stages
 * of growth, then ripe. A clock set back gives a negative age, which stays at planted (no regrowth, no double yield).
 */
export function berryStage(ms: number, hoursPerStage: number): BerryStage {
  const stage = Math.floor(Math.max(0, ms) / (hoursPerStage * 3_600_000));
  return BERRY_STAGES[Math.min(stage, BERRY_STAGES.length - 1)]!;
}

/** The Dowsing MCHN: bearing (0 north, clockwise, degrees) and closeness (1 on top, 0 at the edge) of the nearest target. */
export function dowse(from: { x: number; y: number }, targets: readonly { x: number; y: number }[], radius: number): { dir: number; near: number } | undefined {
  let best: { x: number; y: number; d: number } | undefined;
  for (const t of targets) {
    const d = Math.hypot(t.x - from.x, t.y - from.y);
    if (d <= radius && (!best || d < best.d)) best = { ...t, d };
  }
  if (!best) return undefined;
  const dir = best.d === 0 ? 0 : ((Math.atan2(best.x - from.x, -(best.y - from.y)) * 180) / Math.PI + 360) % 360;
  return { dir: Math.round(dir) % 360, near: Math.round((1 - best.d / radius) * 100) / 100 };
}
