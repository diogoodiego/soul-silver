import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Principle IV: the AI is plain simulation, runnable in Node without the app's graphics or Electron.

const dir = new URL("../../src/ai/", import.meta.url);

describe("AI isolation", () => {
  it.each(readdirSync(dir))("%s imports no Electron, three.js or Svelte", (file) => {
    expect(readFileSync(new URL(file, dir), "utf8")).not.toMatch(/from "(electron|three|svelte)/);
  });
});
