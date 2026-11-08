// The session's clock (spec 026, research R1): the host's PC by default, the same for every player,
// fixed or shifted only by tests and the development command. Host local time, as the DS's RTC.

export type ClockMode = { kind: "host" } | { kind: "fixed"; at: Date } | { kind: "offset"; ms: number };

const MINUTE_MS = 60_000;
/** A session without the host's clock (tests): always the same Sunday noon, so nothing depends on when it runs. */
export const SUNDAY_NOON = () => new Date(2026, 10, 1, 12);

export function createSessionClock(source: () => Date = () => new Date()) {
  let mode: ClockMode = { kind: "host" };

  function now(): Date {
    if (mode.kind === "fixed") return new Date(mode.at);
    if (mode.kind === "offset") return new Date(source().getTime() + mode.ms);
    // A copy: setTime changes the date it reads, and the source may hand out the same object each time.
    return new Date(source().getTime());
  }

  return {
    now,
    hour: () => now().getHours(),
    minuteOfDay: () => {
      const d = now();
      return d.getHours() * 60 + d.getMinutes();
    },
    /** 0 is Sunday, as the original's RTC_WEEK_*. */
    weekday: () => now().getDay(),
    fixed: () => mode.kind === "fixed",
    set(next: ClockMode): void {
      mode = next;
    },
    /** Moves the clock forward; a fixed clock stays fixed at the new moment. */
    advance(minutes: number): void {
      const ms = minutes * MINUTE_MS;
      if (mode.kind === "fixed") mode = { kind: "fixed", at: new Date(mode.at.getTime() + ms) };
      else mode = { kind: "offset", ms: (mode.kind === "offset" ? mode.ms : 0) + ms };
    },
    /** Fixes the clock at an hour (and minute, and weekday of the current week); the rest of the date stays. */
    setTime(t: { hour: number; minute?: number | undefined; weekday?: number | undefined }): void {
      const at = now();
      if (t.weekday !== undefined) at.setDate(at.getDate() + t.weekday - at.getDay());
      at.setHours(t.hour, t.minute ?? 0, 0, 0);
      mode = { kind: "fixed", at };
    },
  };
}
export type SessionClock = ReturnType<typeof createSessionClock>;
