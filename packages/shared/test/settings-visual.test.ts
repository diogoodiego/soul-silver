import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, readSettings, settingsPatch, VISUAL_EFFECTS } from "../src/settings.ts";

describe("visual settings", () => {
  it("defaults to low quality with every effect on, shadows included", () => {
    expect(DEFAULT_SETTINGS.visual.quality).toBe("low");
    expect(VISUAL_EFFECTS).toEqual(["tiltShift", "bloom", "vignette", "fog", "shadows", "godRays", "clouds"]);
    for (const k of VISUAL_EFFECTS) expect(DEFAULT_SETTINGS.visual[k]).toBeGreaterThan(0);
  });

  it("gives shadows their default in a V.1 settings file", () => {
    const v1 = { quality: "high", tiltShift: 10, bloom: 20, vignette: 30, fog: 40 };
    expect(readSettings({ visual: v1 }).visual).toEqual({ ...v1, shadows: DEFAULT_SETTINGS.visual.shadows, godRays: DEFAULT_SETTINGS.visual.godRays, clouds: DEFAULT_SETTINGS.visual.clouds });
  });

  it("fills a settings file written before the field existed", () => {
    expect(readSettings({ uiScale: 1.5 }).visual).toEqual(DEFAULT_SETTINGS.visual);
  });

  it("fills a missing effect with its default and keeps the rest", () => {
    const visual = readSettings({ visual: { quality: "high", bloom: 0 } }).visual;
    expect(visual).toEqual({ ...DEFAULT_SETTINGS.visual, quality: "high", bloom: 0 });
  });

  it("falls back to the defaults on an invalid value", () => {
    for (const bad of [{ quality: "ultra" }, { fog: 101 }, { fog: -5 }, { fog: 33 }, { fog: 50, extra: 1 }]) {
      expect(readSettings({ visual: bad }).visual).toEqual(DEFAULT_SETTINGS.visual);
    }
  });

  it("accepts the limits in steps of 5 and refuses anything else in a patch", () => {
    const full = { ...DEFAULT_SETTINGS.visual };
    expect(settingsPatch.safeParse({ visual: { ...full, quality: "off", tiltShift: 0, bloom: 100 } }).success).toBe(true);
    expect(settingsPatch.safeParse({ visual: { ...full, vignette: 7 } }).success).toBe(false);
    expect(settingsPatch.safeParse({ visual: { ...full, quality: "max" } }).success).toBe(false);
  });

  it("takes bloom in steps of 1, the fine end of a weaker scale", () => {
    const full = { ...DEFAULT_SETTINGS.visual };
    expect(settingsPatch.safeParse({ visual: { ...full, bloom: 37 } }).success).toBe(true);
    expect(settingsPatch.safeParse({ visual: { ...full, bloom: 101 } }).success).toBe(false);
    expect(settingsPatch.safeParse({ visual: { ...full, bloom: 3.5 } }).success).toBe(false);
  });
});
