import type { TypeChartRecord } from "../game-data/tables.ts";

/** Multiplier of a move type against a defender, from the extracted chart: 0, ¼, ½, 1, 2 or 4. */
export function effectiveness(chart: readonly Pick<TypeChartRecord, "id" | "against">[], moveType: number, defender: readonly number[]): number {
  const row = chart.find((r) => r.id === moveType);
  if (!row) return 1;
  return [...new Set(defender)].reduce((m, t) => m * ((row.against[t] ?? 10) / 10), 1);
}
