import { describe, expect, it } from "vitest";
import { chooseItem, chooseSwitch } from "../../src/trainer/decide.ts";
import type { TrainerProfile } from "../../src/trainer/schemas.ts";

const FIRE = 10;
const WATER = 11;
const GRASS = 12;
// Water hits fire for 2, grass for 0.5; everything else is neutral.
const chart = (move: number, types: readonly number[]) => types.reduce((m, t) => m * (move === WATER && t === FIRE ? 2 : move === WATER && t === GRASS ? 0.5 : 1), 1);

const profile: TrainerProfile = {
  combat: "rookie",
  switch: { enabled: true, typeThreshold: 2, hpThreshold: 0.25, cooldownS: 8 },
  item: { enabled: true, hpThreshold: 0.3 },
};
const fire = { types: [FIRE], hp: 30, hpMax: 30 };
const grass = { types: [GRASS], hp: 30, hpMax: 30 };
const normal = { types: [0], hp: 30, hpMax: 30 };
const base = { active: 0, foeMoveTypes: [WATER], effectiveness: chart, profile, nowS: 20, lastSwitchS: undefined };

describe("chooseSwitch", () => {
  it("switches out of a type disadvantage to the safest reserve", () => {
    expect(chooseSwitch({ ...base, team: [fire, normal, grass] })).toBe(2);
  });

  it("stays without a disadvantage or with the profile's switching off", () => {
    expect(chooseSwitch({ ...base, team: [normal, grass] })).toBeUndefined();
    expect(chooseSwitch({ ...base, team: [fire, grass], profile: { ...profile, switch: { ...profile.switch, enabled: false } } })).toBeUndefined();
  });

  it("waits out the cooldown", () => {
    expect(chooseSwitch({ ...base, team: [fire, grass], lastSwitchS: 15 })).toBeUndefined();
    expect(chooseSwitch({ ...base, team: [fire, grass], lastSwitchS: 12 })).toBe(1);
  });

  it("never switches with a team of one or to a fainted member", () => {
    expect(chooseSwitch({ ...base, team: [fire] })).toBeUndefined();
    expect(chooseSwitch({ ...base, team: [fire, { ...grass, hp: 0 }] })).toBeUndefined();
  });

  it("switches on low HP to a member no worse off", () => {
    expect(chooseSwitch({ ...base, foeMoveTypes: [0], team: [{ ...normal, hp: 5 }, normal] })).toBe(1);
  });
});

describe("chooseItem", () => {
  const heals = (item: number) => (item === 17 ? 20 : undefined);

  it("uses a potion below the threshold", () => {
    expect(chooseItem({ hp: 8, hpMax: 30, items: [4, 17], heals, profile })).toBe(17);
  });

  it("keeps it above the threshold, with no healing item, or with items off", () => {
    expect(chooseItem({ hp: 20, hpMax: 30, items: [17], heals, profile })).toBeUndefined();
    expect(chooseItem({ hp: 8, hpMax: 30, items: [4], heals, profile })).toBeUndefined();
    expect(chooseItem({ hp: 8, hpMax: 30, items: [17], heals, profile: { ...profile, item: { ...profile.item, enabled: false } } })).toBeUndefined();
  });

  it("does nothing for a fainted Pokémon", () => {
    expect(chooseItem({ hp: 0, hpMax: 30, items: [17], heals, profile })).toBeUndefined();
  });
});
