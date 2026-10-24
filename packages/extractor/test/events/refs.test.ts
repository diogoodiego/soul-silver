import { describe, expect, it } from "vitest";
import { resolveScript, trainerOfScript } from "../../src/events/refs.ts";

const map = { scriptFile: 140, messageBank: 55 };

describe("resolveScript", () => {
  it("returns null for script ids 0 and 0xFFFF, which mean no script", () => {
    expect(resolveScript(0, map)).toBeNull();
    expect(resolveScript(0xffff, map)).toBeNull();
  });

  it("resolves a small id to the map's own script file, entry id - 1", () => {
    expect(resolveScript(1, map)).toEqual({ id: 1, file: 140, entry: 0, messageBank: 55 });
    expect(resolveScript(1999, map)).toEqual({ id: 1999, file: 140, entry: 1998, messageBank: 55 });
  });

  it("resolves ids from 2000 up to the shared script files, by the highest range that fits", () => {
    expect(resolveScript(2000, map)).toEqual({ id: 2000, file: 3, entry: 0, messageBank: 40 });
    expect(resolveScript(7005, map)).toEqual({ id: 7005, file: 141, entry: 5, messageBank: 199 });
    expect(resolveScript(10000, map)).toEqual({ id: 10000, file: 146, entry: 0, messageBank: 211 });
    expect(resolveScript(10490, map)).toEqual({ id: 10490, file: 263, entry: 0, messageBank: 433 });
  });

  it("keeps the map file and message bank null when the map has none", () => {
    expect(resolveScript(5, { scriptFile: null, messageBank: null })).toBeNull();
  });
});

describe("trainerOfScript", () => {
  it("maps trainer script ids to trainer ids (the first trainer is 1)", () => {
    expect(trainerOfScript(3000)).toBe(1);
    expect(trainerOfScript(3001)).toBe(2);
    expect(trainerOfScript(4999)).toBe(2000);
    expect(trainerOfScript(5000)).toBe(1);
    expect(trainerOfScript(6999)).toBe(2000);
  });

  it("returns null outside the trainer ranges", () => {
    expect(trainerOfScript(2999)).toBeNull();
    expect(trainerOfScript(7000)).toBeNull();
    expect(trainerOfScript(0)).toBeNull();
  });
});
