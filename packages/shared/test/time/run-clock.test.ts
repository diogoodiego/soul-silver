import { describe, expect, it } from "vitest";
import { runClock } from "../../src/time/tint.ts";

// Spec 026: the client runs the session's clock on between the server's messages (every 5 s).

describe("runClock", () => {
  it("adds the time since the message, in fractional minutes", () => {
    expect(runClock({ minuteOfDay: 600, weekday: 1, fixed: false }, 90_000)).toEqual({ minuteOfDay: 601.5, weekday: 1 });
  });

  it("rolls over midnight into the next day, Saturday into Sunday", () => {
    expect(runClock({ minuteOfDay: 1439, weekday: 6, fixed: false }, 120_000)).toEqual({ minuteOfDay: 1, weekday: 0 });
  });

  it("stands still when fixed", () => {
    expect(runClock({ minuteOfDay: 1320, weekday: 4, fixed: true }, 3_600_000)).toEqual({ minuteOfDay: 1320, weekday: 4 });
  });
});
