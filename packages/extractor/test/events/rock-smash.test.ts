import { describe, expect, it } from "vitest";
import { readRockSmash } from "../../src/events/rock-smash.ts";

// Spec 025, T053: one NARC a/2/5/3 member per map, u16 odds then u16 item list (rock_smash_item.c,
// ROCK_SMASH), from synthetic bytes (principle II).

const member = (odds: number, type: number) => new Uint8Array([odds & 0xff, odds >> 8, type & 0xff, type >> 8]);

describe("readRockSmash", () => {
  it("reads the odds and the item list of each map", () => {
    expect(readRockSmash(member(20, 0), 7)).toEqual({ id: 7, odds: 20, items: "default" });
    expect(readRockSmash(member(10, 1), 8)).toEqual({ id: 8, odds: 10, items: "ruinsOfAlph" });
    expect(readRockSmash(member(15, 2), 9)).toEqual({ id: 9, odds: 15, items: "cliffCave" });
  });

  it("leaves out a map whose rocks never hold items", () => {
    expect(readRockSmash(member(0, 0), 7)).toBeNull();
  });

  it("refuses a member of the wrong size, odds over 100 or an unknown list", () => {
    expect(() => readRockSmash(new Uint8Array(6), 7)).toThrow(/rock smash 7/);
    expect(() => readRockSmash(member(101, 0), 7)).toThrow(/rock smash 7/);
    expect(() => readRockSmash(member(10, 3), 7)).toThrow(/rock smash 7/);
  });
});
