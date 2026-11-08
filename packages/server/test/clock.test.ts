import { describe, expect, it } from "vitest";
import { createSessionClock } from "../src/clock.ts";
import { timeOfDay } from "@soulsilver/shared/wild";

// Spec 026, research R1: one clock for the session, from the host's PC, which tests and the
// development command replace.

const BANDS = { morning: 4, day: 10, night: 20 };
/** Monday 2026-11-02 at 07:30, host local time. */
const MONDAY_0730 = new Date(2026, 10, 2, 7, 30);

describe("session clock", () => {
  it("reads the source: hour, minute of the day and weekday (0 Sunday)", () => {
    const clock = createSessionClock(() => MONDAY_0730);
    expect(clock.hour()).toBe(7);
    expect(clock.minuteOfDay()).toBe(7 * 60 + 30);
    expect(clock.weekday()).toBe(1);
    expect(clock.fixed()).toBe(false);
    expect(timeOfDay(clock.hour(), BANDS)).toBe("morning");
  });

  it("follows the source while it is the host's", () => {
    let now = MONDAY_0730;
    const clock = createSessionClock(() => now);
    now = new Date(2026, 10, 2, 21, 0);
    expect(timeOfDay(clock.hour(), BANDS)).toBe("night");
  });

  it("fixes a moment that no longer moves with the source", () => {
    let now = MONDAY_0730;
    const clock = createSessionClock(() => now);
    clock.set({ kind: "fixed", at: new Date(2026, 10, 7, 12, 0) });
    now = new Date(2026, 10, 9, 3, 0);
    expect(clock.hour()).toBe(12);
    expect(clock.weekday()).toBe(6);
    expect(clock.fixed()).toBe(true);
  });

  it("shifts the source by an offset", () => {
    const clock = createSessionClock(() => MONDAY_0730);
    clock.set({ kind: "offset", ms: 14 * 3600_000 });
    expect(clock.hour()).toBe(21);
    expect(clock.weekday()).toBe(1);
    expect(clock.fixed()).toBe(false);
  });

  it("goes back to the host's clock", () => {
    const clock = createSessionClock(() => MONDAY_0730);
    clock.set({ kind: "offset", ms: 3600_000 });
    clock.set({ kind: "host" });
    expect(clock.hour()).toBe(7);
  });

  it("advances a fixed clock and an offset one alike, across midnight and the week", () => {
    const clock = createSessionClock(() => MONDAY_0730);
    clock.advance(17 * 60);
    expect([clock.hour(), clock.weekday()]).toEqual([0, 2]);
    clock.set({ kind: "fixed", at: new Date(2026, 11, 0 + 6, 23, 50) });
    clock.advance(20);
    expect([clock.hour(), clock.minuteOfDay(), clock.fixed()]).toEqual([0, 10, true]);
  });

  it("sets an hour, minute and weekday of the current week", () => {
    const clock = createSessionClock(() => MONDAY_0730);
    clock.setTime({ hour: 22, minute: 5, weekday: 4 });
    expect([clock.hour(), clock.minuteOfDay(), clock.weekday(), clock.fixed()]).toEqual([22, 22 * 60 + 5, 4, true]);
    clock.setTime({ hour: 9 });
    expect([clock.hour(), clock.minuteOfDay(), clock.weekday()]).toEqual([9, 9 * 60, 4]);
  });
});
