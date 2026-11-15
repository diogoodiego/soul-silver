import { describe, expect, it } from "vitest";
import { createRunner } from "../../src/script/runner.ts";
import { SCRIPT_HANDLERS } from "../../src/script/index.ts";
import { fakeHost, makeScript, type FakeHost } from "./fixture.ts";

// Spec 030, item 030.2: the Route 32 weekday sibling's ribbon (MonHasRibbon, GiveRibbon) and Cameron the
// photographer (PhotoAlbumIsFull, CameronPhoto). Synthetic scripts and host (principle II).

const run = (lines: Parameters<typeof makeScript>[0], host: FakeHost) => createRunner(host, SCRIPT_HANDLERS, { file: makeScript(lines), entry: 0 });

function host() {
  const h = fakeHost({ party: [{ species: 155, level: 5, hp: 20 }, { species: 16, level: 3, hp: 9 }] });
  const ribbons = new Map<number, number[]>();
  const photos: number[] = [];
  h.monHasRibbon = (slot, ribbon) => ribbons.get(slot)?.includes(ribbon) ?? false;
  h.giveRibbon = (slot, ribbon) => void ribbons.set(slot, [...(ribbons.get(slot) ?? []), ribbon]);
  h.photoAlbumFull = () => photos.length >= 2;
  h.takePhoto = (spot) => void photos.push(spot);
  return { h, ribbons, photos };
}

describe("ribbons and photos (spec 030.2)", () => {
  it("MonHasRibbon reads the slot from a var; GiveRibbon gives that member the ribbon", () => {
    const { h, ribbons } = host();
    const slot: Parameters<typeof makeScript>[0][number] = ["SetVar", { var: { variable: 0x8002 }, val: 1 }];
    const has = () => {
      run([slot, ["MonHasRibbon", { arg0: 0x800c, arg1: 0x8002, arg2: 63 }], ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x800c } }], ["End"]], h).step();
      return h.vars.get(0x4001);
    };
    expect(has()).toBe(0);
    run([slot, ["GiveRibbon", { arg0: 0x8002, arg1: 63 }], ["End"]], h).step();
    expect(ribbons.get(1)).toEqual([63]);
    expect(has()).toBe(1);
  });

  it("PhotoAlbumIsFull is 1 once the album is full; CameronPhoto adds the spot's photo", () => {
    const { h, photos } = host();
    const full = () => {
      run([["PhotoAlbumIsFull", { arg0: 0x800c }], ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x800c } }], ["End"]], h).step();
      return h.vars.get(0x4001);
    };
    expect(full()).toBe(0);
    run([["CameronPhoto", { arg0: 5 }], ["CameronPhoto", { arg0: 5 }], ["End"]], h).step();
    expect(photos).toEqual([5, 5]);
    expect(full()).toBe(1);
  });

  it("a host without them reads no ribbon and a full album, so nothing is given or taken", () => {
    const h = fakeHost({ party: [{ species: 155, level: 5, hp: 20 }] });
    run([["MonHasRibbon", { arg0: 0x800c, arg1: 0, arg2: 63 }], ["CopyVar", { dst: { variable: 0x4001 }, src: { variable: 0x800c } }], ["PhotoAlbumIsFull", { arg0: 0x800c }], ["CopyVar", { dst: { variable: 0x4002 }, src: { variable: 0x800c } }], ["End"]], h).step();
    expect([h.vars.get(0x4001), h.vars.get(0x4002)]).toEqual([0, 1]);
  });
});
