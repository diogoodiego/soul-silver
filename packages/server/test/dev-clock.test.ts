import { describe, expect, it } from "vitest";
import { scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 026, FR-016: debugSetClock fixes or advances the session's clock for every player. Same gate
// as the other development commands: a development build with the script debugger on.

const data = () => scriptData([scriptFile(100, ["L1:", ["End"]])], {});
/** Monday 2026-11-02 at 07:30, host local time. */
const MONDAY_0730 = new Date(2026, 10, 2, 7, 30);

function game(devTools: boolean) {
  const t = story(data(), { ...(devTools ? { devTools: true } : {}), now: () => MONDAY_0730 });
  const a = t.connect();
  const b = t.connect();
  a.conn.send({ type: "debugScript", on: true });
  return { t, a, b };
}

describe("debugSetClock (spec 026)", () => {
  it("fixes the clock and every player gets it", () => {
    const { t, a, b } = game(true);
    a.conn.send({ type: "debugSetClock", clock: { mode: "fixed", hour: 22, minute: 5, weekday: 4 } });
    t.step();
    for (const c of [a, b]) expect(t.of(c, "clock").at(-1)).toEqual({ type: "clock", minuteOfDay: 22 * 60 + 5, weekday: 4, fixed: true });
  });

  it("advances from the current time, across midnight", () => {
    const { t, a, b } = game(true);
    a.conn.send({ type: "debugSetClock", clock: { mode: "advance", minutes: 17 * 60 } });
    t.step();
    expect(t.of(b, "clock").at(-1)).toEqual({ type: "clock", minuteOfDay: 30, weekday: 2, fixed: false });
    a.conn.send({ type: "debugSetClock", clock: { mode: "advance", minutes: 60 } });
    t.step();
    expect(t.of(b, "clock").at(-1)).toMatchObject({ minuteOfDay: 90, weekday: 2 });
  });

  it("goes back to the host's clock", () => {
    const { t, a } = game(true);
    a.conn.send({ type: "debugSetClock", clock: { mode: "fixed", hour: 22 } });
    a.conn.send({ type: "debugSetClock", clock: { mode: "host" } });
    t.step();
    expect(t.of(a, "clock").at(-1)).toEqual({ type: "clock", minuteOfDay: 7 * 60 + 30, weekday: 1, fixed: false });
  });

  it.each([
    ["with the debugger off", true, false],
    ["in a release build", false, true],
  ])("is refused %s, changes nothing and logs it", (_, devTools, debuggerOn) => {
    const t = story(data(), { ...(devTools ? { devTools: true } : {}), now: () => MONDAY_0730 });
    const a = t.connect();
    if (debuggerOn) a.conn.send({ type: "debugScript", on: true });
    const before = t.of(a, "clock").length;
    a.conn.send({ type: "debugSetClock", clock: { mode: "fixed", hour: 22 } });
    t.step();
    expect(t.of(a, "clock").slice(before)).toEqual([]);
    expect(t.logs.some((l) => l.includes("Refused debugSetClock"))).toBe(true);
  });
});

describe("debugSetClock from a guest (spec 026, FR-016)", () => {
  it("is refused for a player who is not the host, even with the debugger on", () => {
    const { t, a, b } = game(true);
    b.conn.send({ type: "debugScript", on: true });
    const before = t.of(a, "clock").length;
    b.conn.send({ type: "debugSetClock", clock: { mode: "fixed", hour: 22 } });
    t.step();
    expect(t.of(a, "clock").slice(before)).toEqual([]);
    expect(t.logs.some((l) => l.includes("Refused debugSetClock") && l.includes("not the host"))).toBe(true);
  });
});
