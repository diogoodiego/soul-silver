import { describe, expect, it } from "vitest";
import { hpRestore } from "../../src/game/items";

// Raw party-use bytes of the SoulSilver (US) items, as extracted (spec 004): byte 5 bit 2 is "restore HP",
// byte 13 the amount (0xff full), byte 1 bit 0 "revive".
const item = (pocket: string, params: string) => ({ pocket: pocket as "medicine", partyUse: { kind: 1, params } });
const POTION = item("medicine", "0000000000040000000000000014000000000000");
const SUPER_POTION = item("medicine", "0000000000040000000000000032000000000000");
const MAX_POTION = item("medicine", "00000000000400000000000000ff000000000000");
const REVIVE = item("medicine", "00010000000400000000000000fe000000000000");
const ANTIDOTE = item("medicine", "0200000000000000000000000000000000000000");
const POKE_BALL = item("balls", "0300000000000000000000000000000000000000");

describe("hpRestore", () => {
  it("reads the amount of the potions", () => {
    expect(hpRestore(POTION)).toBe(20);
    expect(hpRestore(SUPER_POTION)).toBe(50);
  });

  it("is full for 0xff", () => {
    expect(hpRestore(MAX_POTION)).toBe("full");
  });

  it("is undefined for revives, status cures and items outside the medicine pocket", () => {
    expect(hpRestore(REVIVE)).toBeUndefined();
    expect(hpRestore(ANTIDOTE)).toBeUndefined();
    expect(hpRestore(POKE_BALL)).toBeUndefined();
  });
});
