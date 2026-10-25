/** Gen 4 blackout loss: highest party level times the base for the badges, capped at the money held (FR-021). */
export function moneyLoss(money: number, levels: readonly number[], badges: number, base: readonly number[]): number {
  const loss = Math.max(0, ...levels) * base[Math.min(badges, base.length - 1)]!;
  return Math.min(money, loss);
}
