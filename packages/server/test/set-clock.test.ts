import { describe, expect, it } from "vitest";
import { scriptData, scriptFile, story } from "./scripts-fixture";

// The host picks the time of day; the clock runs on from it, every player gets it and the host's save keeps it.

const data = () => scriptData([scriptFile(100, ["L1:", ["End"]])], {});
/** Monday 2026-11-02 at 07:30, host local time. */
const MONDAY_0730 = new Date(2026, 10, 2, 7, 30);
const HOUR = 3_600_000;

describe("setClock", () => {
  it("moves the clock for everyone, keeps it running and saves the difference in the host's save", () => {
    const t = story(data(), { now: () => MONDAY_0730 });
    const a = t.connect();
    const b = t.connect();
    a.conn.send({ type: "setClock", minuteOfDay: 20 * 60 + 30 });
    t.step();
    for (const c of [a, b]) expect(t.of(c, "clock").at(-1)).toEqual({ type: "clock", minuteOfDay: 20 * 60 + 30, weekday: 1, fixed: false });
    a.conn.send({ type: "save-now" });
    b.conn.send({ type: "save-now" });
    expect(t.of(a, "save").at(-1)!.save.clockOffsetMs).toBe(13 * HOUR);
    expect(t.of(b, "save").at(-1)!.save.clockOffsetMs).toBe(0);
  });

  it("goes back to the PC's clock", () => {
    const t = story(data(), { now: () => MONDAY_0730 });
    const a = t.connect();
    a.conn.send({ type: "setClock", minuteOfDay: 60 });
    a.conn.send({ type: "setClock", minuteOfDay: null });
    t.step();
    expect(t.of(a, "clock").at(-1)).toMatchObject({ minuteOfDay: 7 * 60 + 30 });
  });

  it("starts from the host's saved difference", () => {
    const t = story(data(), { now: () => MONDAY_0730 });
    const a = t.connect(undefined, undefined, { save: { clockOffsetMs: -2 * HOUR } });
    t.step();
    expect(t.of(a, "clock").at(-1)).toMatchObject({ minuteOfDay: 5 * 60 + 30 });
  });

  it("is refused from a guest", () => {
    const t = story(data(), { now: () => MONDAY_0730 });
    const a = t.connect();
    const b = t.connect();
    b.conn.send({ type: "setClock", minuteOfDay: 60 });
    t.step();
    expect(t.of(a, "clock").at(-1)).toMatchObject({ minuteOfDay: 7 * 60 + 30 });
    expect(t.of(b, "notice").at(-1)).toMatchObject({ code: "action-refused" });
  });
});
