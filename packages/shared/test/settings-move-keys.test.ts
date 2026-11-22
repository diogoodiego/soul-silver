import { describe, expect, it } from "vitest";
import { DEFAULT_KEYS } from "../src/input/bindings.ts";
import { DEFAULT_SETTINGS, readSettings } from "../src/settings.ts";

// Block H moved the move keys from 1–4 to J/K/L/I; settings saved before kept 1–4, as they save every key.

const OLD = { move1: ["Digit1"], move2: ["Digit2"], move3: ["Digit3"], move4: ["Digit4"] };

describe("move keys from before block H", () => {
  it("move from the old 1–4 defaults to J/K/L/I", () => {
    const b = readSettings({ bindings: { ...DEFAULT_SETTINGS.bindings, ...OLD } }).bindings;
    expect([b.move1, b.move2, b.move3, b.move4]).toEqual([DEFAULT_KEYS.move1, DEFAULT_KEYS.move2, DEFAULT_KEYS.move3, DEFAULT_KEYS.move4]);
  });

  it("keep keys the player chose", () => {
    const b = readSettings({ bindings: { ...DEFAULT_SETTINGS.bindings, ...OLD, move4: ["KeyU"] } }).bindings;
    expect([b.move1, b.move4]).toEqual([["Digit1"], ["KeyU"]]);
  });
});
