import { describe, expect, it } from "vitest";
import { timeOfDay } from "../../src/wild/time-of-day.ts";

const bands = { morning: 4, day: 10, night: 20 };

describe("timeOfDay", () => {
  it.each([
    [0, "night"],
    [3, "night"],
    [4, "morning"],
    [9, "morning"],
    [10, "day"],
    [19, "day"],
    [20, "night"],
    [23, "night"],
  ] as const)("hour %i is %s", (hour, expected) => {
    expect(timeOfDay(hour, bands)).toBe(expected);
  });
});
