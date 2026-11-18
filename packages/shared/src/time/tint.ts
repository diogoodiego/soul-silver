import type { SpawnRules } from "../wild/schemas.ts";
import { timeOfDay } from "../wild/time-of-day.ts";
import type { Rgb, TintPalette } from "./schemas.ts";

const DAY_MINUTES = 1440;

/**
 * The colour over an outdoor map at a minute of the day (spec 026, research R2): the band's own inside it,
 * a linear blend over `transitionMinutes` centred on each band edge. Periodic over the day, so it never jumps.
 */
export function tintAt(minuteOfDay: number, bands: SpawnRules["timeBands"], palette: TintPalette): Rgb {
  const m = ((minuteOfDay % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const half = palette.transitionMinutes / 2;
  const edges = [
    { at: bands.morning * 60, from: palette.night, to: palette.morning },
    { at: bands.day * 60, from: palette.morning, to: palette.day },
    { at: bands.night * 60, from: palette.day, to: palette.night },
  ];
  for (const e of edges) {
    // Signed distance to the edge, the short way round the day.
    const d = ((m - e.at + DAY_MINUTES * 1.5) % DAY_MINUTES) - DAY_MINUTES / 2;
    if (half > 0 && Math.abs(d) < half) {
      const t = (d + half) / palette.transitionMinutes;
      return { r: e.from.r + (e.to.r - e.from.r) * t, g: e.from.g + (e.to.g - e.from.g) * t, b: e.from.b + (e.to.b - e.from.b) * t };
    }
  }
  return { ...palette[timeOfDay(Math.floor(m / 60), bands)] };
}

/** The session's clock some time after its last message (spec 026): fractional minutes; a fixed clock stands still. */
export function runClock(sample: { minuteOfDay: number; weekday: number; fixed: boolean }, elapsedMs: number): { minuteOfDay: number; weekday: number } {
  if (sample.fixed) return { minuteOfDay: sample.minuteOfDay, weekday: sample.weekday };
  const total = sample.minuteOfDay + Math.max(0, elapsedMs) / 60_000;
  return { minuteOfDay: total % DAY_MINUTES, weekday: (sample.weekday + Math.floor(total / DAY_MINUTES)) % 7 };
}

/**
 * How much sun is in a tint, 0 at the night colour and 1 at the day one: its darkest channel placed
 * between theirs. Drives the effects that need the sun (god rays, cloud shadows), in step with the tint.
 */
export function daylight(tint: Rgb, palette: TintPalette): number {
  const low = (c: Rgb) => Math.min(c.r, c.g, c.b);
  const span = low(palette.day) - low(palette.night);
  return span <= 0 ? 1 : Math.max(0, Math.min(1, (low(tint) - low(palette.night)) / span));
}
