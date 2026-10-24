import type { TickMetrics } from "@soulsilver/shared/game";

/** Tick durations over a sliding window, for the debug panel (spec 010, FR-006). */
export function createTickMetrics(window = 100) {
  const samples: number[] = [];
  let overruns = 0;

  return {
    record(ms: number): void {
      samples.push(ms);
      if (samples.length > window) samples.shift();
    },
    overrun(dropped: number): void {
      overruns += dropped;
    },
    snapshot(): TickMetrics {
      if (samples.length === 0) return { lastMs: 0, avgMs: 0, maxMs: 0, overruns };
      return {
        lastMs: samples[samples.length - 1]!,
        avgMs: samples.reduce((a, b) => a + b, 0) / samples.length,
        maxMs: Math.max(...samples),
        overruns,
      };
    },
  };
}
