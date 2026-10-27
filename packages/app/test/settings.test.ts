import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "@soulsilver/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSettings } from "../src/main/settings";

let dir: string;
let path: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ss-settings-"));
  path = join(dir, "settings.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("settings", () => {
  it("starts with the defaults", async () => {
    expect(await createSettings(path).get()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ firewallNoticeSeen: false, window: { width: 1280, height: 720 }, fullscreen: false, textSpeed: "mid", uiScale: 1, crt: true });
  });

  it("remembers the notice was seen across instances", async () => {
    await createSettings(path).markFirewallNoticeSeen();
    expect((await createSettings(path).get()).firewallNoticeSeen).toBe(true);
  });

  it("falls back to defaults on a broken file", async () => {
    await writeFile(path, "{ broken");
    expect(await createSettings(path).get()).toEqual(DEFAULT_SETTINGS);
  });

  it("reads a spec 012 file and fills the new fields with defaults", async () => {
    await writeFile(path, JSON.stringify({ firewallNoticeSeen: true }));
    expect(await createSettings(path).get()).toEqual({ ...DEFAULT_SETTINGS, firewallNoticeSeen: true });
  });

  it("replaces only the invalid fields with their defaults", async () => {
    await writeFile(path, JSON.stringify({ textSpeed: "warp", uiScale: 1.25, window: { width: 1000, height: 700 }, bindings: { up: ["KeyW"] } }));
    const s = await createSettings(path).get();
    expect(s.textSpeed).toBe("mid");
    expect(s.uiScale).toBe(1.25);
    expect(s.window).toEqual({ width: 1280, height: 720 });
    expect(s.bindings).toEqual(DEFAULT_SETTINGS.bindings);
  });

  it("applies a valid patch and persists it", async () => {
    const next = await createSettings(path).set({ textSpeed: "fast", uiScale: 1.5, fullscreen: true, window: { width: 1920, height: 1080 } });
    expect(next).toMatchObject({ textSpeed: "fast", uiScale: 1.5, fullscreen: true, window: { width: 1920, height: 1080 } });
    expect(await createSettings(path).get()).toEqual(next);
  });

  it("refuses an invalid patch and keeps the old settings", async () => {
    const s = createSettings(path);
    await s.set({ textSpeed: "slow" });
    for (const patch of [{ uiScale: 2 }, { textSpeed: "warp" }, { window: { width: 800, height: 600 } }, { bindings: { ...DEFAULT_SETTINGS.bindings, combat: ["F11"] } }, { unknown: 1 }]) {
      expect((await s.set(patch)).textSpeed).toBe("slow");
    }
    expect((await s.get()).uiScale).toBe(1);
  });

  // Spec 018: audio preferences live here, not in the save.
  it("starts audio at 80/80/80, not muted when unfocused", async () => {
    expect((await createSettings(path).get()).audio).toEqual({ master: 80, music: 80, effects: 80, muteUnfocused: false });
  });

  it("falls back to the default audio when the file has an invalid one", async () => {
    for (const audio of [{ master: 80, music: 83, effects: 80, muteUnfocused: false }, { master: 120, music: 80, effects: 80, muteUnfocused: false }]) {
      await writeFile(path, JSON.stringify({ audio }));
      expect((await createSettings(path).get()).audio).toEqual(DEFAULT_SETTINGS.audio);
    }
  });

  it("persists a valid audio patch and refuses one off the 0–100 step-5 scale", async () => {
    const s = createSettings(path);
    const audio = { master: 50, music: 0, effects: 100, muteUnfocused: true };
    expect((await s.set({ audio })).audio).toEqual(audio);
    expect((await createSettings(path).get()).audio).toEqual(audio);
    expect((await s.set({ audio: { ...audio, music: 7 } })).audio).toEqual(audio);
    expect((await s.set({ audio: { ...audio, effects: -5 } })).audio).toEqual(audio);
  });
});
