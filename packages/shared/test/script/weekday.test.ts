import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Spec 026, US2: the original's day events are map-load scripts that read the clock and set a
// person's hide flag. The shape is Route 29's Tuscany (scr_seq_0225_R29.s, _0043): shown on Tuesday only.

const HIDE = 207;
const tuesdayOnly = makeScript([
  ["GetWeekday", { arg0: 0x4000 }],
  ["CompareVarToValue", { var: { variable: 0x4000 }, val: 2 }],
  ["GoToIf", { condition: 5, dest: { label: "L2" } }],
  ["ClearFlag", { flag: { flag: HIDE } }],
  ["End"],
  "L2:",
  ["SetFlag", { flag: { flag: HIDE } }],
  ["End"],
]);
const run = (file: ReturnType<typeof makeScript>, over: Parameters<typeof fakeHost>[0]) => {
  const host = fakeHost(over);
  createRunner(host, SCRIPT_HANDLERS, { file, entry: 0 }).step();
  return host;
};

describe("events by weekday (spec 026, US2)", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])("weekday %i shows the Tuesday person only on Tuesday", (day) => {
    expect(run(tuesdayOnly, { weekday: () => day }).flags.has(HIDE)).toBe(day !== 2);
  });

  // gf_rtc.c sTimeOfDayByHour, include/gf_rtc.h: MORN 0, DAY 1, EVE 2, NITE 3, LATE 4.
  const RTC = [4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3];
  it.each(RTC.map((band, hour) => [hour, band]))("ScrCmd_379 (time of day) at %i h is %i", (hour, band) => {
    const host = run(makeScript([["ScrCmd_379", { arg0: 0x4001 }], ["End"]]), { hour: () => hour });
    expect(host.vars.get(0x4001)).toBe(band);
  });
});
