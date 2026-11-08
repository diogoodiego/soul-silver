import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timeOfDay } from "../../src/wild/time-of-day.ts";

// Spec 026, SC-001: the original bands for every hour (gf_rtc.c, GF_RTC_GetTimeOfDayWildParamByHour),
// read from content/wild/spawn.json, the single source the tint and the spawns share (FR-002).

const spawn = JSON.parse(readFileSync(new URL("../../../../content/wild/spawn.json", import.meta.url), "utf8")) as { value: { timeBands: { morning: number; day: number; night: number } } };
const bands = spawn.value.timeBands;
const ORIGINAL = Array.from({ length: 24 }, (_, h) => (h >= 4 && h <= 9 ? "morning" : h >= 10 && h <= 19 ? "day" : "night"));

describe("band of the day", () => {
  it.each(ORIGINAL.map((band, hour) => [hour, band] as const))("hour %i is %s", (hour, band) => {
    expect(timeOfDay(hour, bands)).toBe(band);
  });

  it("follows other bands when the data changes", () => {
    const other = { morning: 6, day: 12, night: 18 };
    expect([5, 6, 11, 12, 17, 18].map((h) => timeOfDay(h, other))).toEqual(["night", "morning", "morning", "day", "day", "night"]);
  });
});
