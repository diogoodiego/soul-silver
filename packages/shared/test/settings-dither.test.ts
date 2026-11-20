import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, readSettings, settingsPatch } from "../src/settings.ts";

// The ordered dither over the Pokédex screen (settings and phone).

describe("dither setting", () => {
  it("is on by default and old settings files get it on", () => {
    expect(DEFAULT_SETTINGS.dither).toBe(true);
    expect(readSettings({ crt: false }).dither).toBe(true);
  });

  it("keeps a saved choice and refuses non-booleans", () => {
    expect(readSettings({ dither: false }).dither).toBe(false);
    expect(settingsPatch.safeParse({ dither: false }).success).toBe(true);
    expect(settingsPatch.safeParse({ dither: "yes" }).success).toBe(false);
  });
});
