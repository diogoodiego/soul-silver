import { describe, expect, it } from "vitest";
import { createWindowOptions } from "../src/main/window-options";

describe("createWindowOptions", () => {
  const options = createWindowOptions("C:/app/preload.cjs");
  const prefs = options.webPreferences ?? {};

  it("isolates the renderer", () => {
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.webSecurity).toBe(true);
  });

  it("does not enable Node in workers, subframes or webviews", () => {
    expect(prefs.nodeIntegrationInWorker).not.toBe(true);
    expect(prefs.nodeIntegrationInSubFrames).not.toBe(true);
    expect(prefs.webviewTag).not.toBe(true);
  });

  it("keeps timers running in the background so the game keeps sending inputs", () => {
    expect(prefs.backgroundThrottling).toBe(false);
  });

  it("uses the given preload and the app title", () => {
    expect(prefs.preload).toBe("C:/app/preload.cjs");
    expect(options.title).toBe("SoulSilver Desktop");
  });
});
