export interface ProgressSample {
  t: number;
  percent: number;
}

/** Seconds left at the average rate since `first`; undefined until 3 s and 3% have passed. */
export function etaSeconds(first: ProgressSample, now: ProgressSample): number | undefined {
  const dt = now.t - first.t;
  const dp = now.percent - first.percent;
  if (dt < 3000 || dp < 3) return undefined;
  return Math.round(((100 - now.percent) * dt) / dp / 1000);
}
