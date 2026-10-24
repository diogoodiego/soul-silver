import { describe, expect, it } from "vitest";
import { createTickMetrics } from "../src/tick-metrics";

describe("createTickMetrics", () => {
  it("starts at zero", () => {
    expect(createTickMetrics().snapshot()).toEqual({ lastMs: 0, avgMs: 0, maxMs: 0, overruns: 0 });
  });

  it("reports last, average and worst over the window", () => {
    const m = createTickMetrics(3);
    for (const ms of [9, 1, 2, 3]) m.record(ms);
    expect(m.snapshot()).toEqual({ lastMs: 3, avgMs: 2, maxMs: 3, overruns: 0 });
  });

  it("counts dropped ticks", () => {
    const m = createTickMetrics();
    m.overrun(2);
    m.overrun(3);
    expect(m.snapshot().overruns).toBe(5);
  });
});
