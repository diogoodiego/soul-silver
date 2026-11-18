import { describe, expect, it } from "vitest";
import { daylight, tintAt } from "../../src/time/tint.ts";

// Spec 026, research R2: the tint is the band's colour inside it and a linear blend centred on each
// band edge; continuous over the whole day, midnight included (SC-001).

const bands = { morning: 4, day: 10, night: 20 };
const palette = {
  morning: { r: 1, g: 0.8, b: 0.6 },
  day: { r: 1, g: 1, b: 1 },
  night: { r: 0.4, g: 0.5, b: 0.8 },
  transitionMinutes: 60,
};
const close = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
  for (const k of ["r", "g", "b"] as const) expect(a[k]).toBeCloseTo(b[k], 6);
};

describe("tintAt", () => {
  it.each([
    ["morning", 7 * 60],
    ["day", 15 * 60],
    ["night", 0],
    ["night", 23 * 60],
  ] as const)("is the %s colour inside the band (minute %i)", (band, minute) => {
    close(tintAt(minute, bands, palette), palette[band]);
  });

  it("is half way on each edge", () => {
    const mid = (a: "morning" | "day" | "night", b: "morning" | "day" | "night") => {
      const x = palette[a];
      const y = palette[b];
      return { r: (x.r + y.r) / 2, g: (x.g + y.g) / 2, b: (x.b + y.b) / 2 };
    };
    close(tintAt(4 * 60, bands, palette), mid("night", "morning"));
    close(tintAt(10 * 60, bands, palette), mid("morning", "day"));
    close(tintAt(20 * 60, bands, palette), mid("day", "night"));
  });

  it("blends only within the transition, centred on the edge", () => {
    close(tintAt(10 * 60 - 31, bands, palette), palette.morning);
    close(tintAt(10 * 60 + 31, bands, palette), palette.day);
    expect(tintAt(10 * 60 - 15, bands, palette).g).toBeCloseTo(0.8 + 0.2 * 0.25, 6);
  });

  it("never jumps over the 1440 minutes, midnight included", () => {
    const epsilon = 0.2 / palette.transitionMinutes + 1e-9;
    for (let m = 0; m < 1440; m++) {
      const a = tintAt(m, bands, palette);
      const b = tintAt((m + 1) % 1440, bands, palette);
      for (const k of ["r", "g", "b"] as const) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(Math.abs(palette.night.r - palette.day.r) / palette.transitionMinutes + epsilon);
    }
  });

  it("takes fractional minutes and wraps out-of-range ones", () => {
    close(tintAt(10 * 60 + 0.5, bands, palette), tintAt(10 * 60 + 0.5 + 1440, bands, palette));
    close(tintAt(-60, bands, palette), tintAt(23 * 60, bands, palette));
  });

  it("switches at the edge with no transition", () => {
    const hard = { ...palette, transitionMinutes: 0 };
    close(tintAt(10 * 60 - 0.01, bands, hard), palette.morning);
    close(tintAt(10 * 60, bands, hard), palette.day);
  });
});

describe("daylight", () => {
  it("is 1 at day, 0 at night and in between in the morning", () => {
    expect(daylight({ ...palette.day }, palette)).toBe(1);
    expect(daylight({ ...palette.night }, palette)).toBe(0);
    const morning = daylight({ ...palette.morning }, palette);
    expect(morning).toBeGreaterThan(0);
    expect(morning).toBeLessThan(1);
  });

  it("rises smoothly through the dawn blend", () => {
    const at = (m: number) => daylight(tintAt(m, bands, palette), palette);
    expect(at(4 * 60 - 20)).toBeLessThan(at(4 * 60 + 20));
    expect(at(4 * 60 + 20)).toBeLessThanOrEqual(at(10 * 60 + 40));
  });
});
