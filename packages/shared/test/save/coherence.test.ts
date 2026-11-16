import { describe, expect, it } from "vitest";
import type { WorldMap } from "../../src/game/world-map.ts";
import { checkCoherence, COHERENCE_RULES, flyPointsRule, type CoherenceRule } from "../../src/save/coherence.ts";
import { newBoxes, newItemState, type Save } from "../../src/save/schema.ts";

const save: Save = {
  schemaVersion: 16, daycare: [], daycareEgg: false, eggWalk: 0, photos: [],
  rivalName: "",
  storyRev: 1,
  phone: { contacts: [], seeking: [], called: [], pending: [], log: [] },
  ...newItemState(),
  flags: [],
  vars: {}, npcPlacement: {},
  name: "Gold",
  character: "male",
  area: "60",
  x: 100,
  y: 100,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
  party: [],
  money: 0,
  badgeSet: 0,
  flyPoints: [],
  respawn: null,
  bag: [],
  pokedex: { seen: [16], caught: [16] },
  boxes: newBoxes(),
  pcItems: [],
  pending: [],
};
const map: WorldMap = { id: "60", levels: [], warps: [], neighbors: [], widthPx: 320, heightPx: 240 };
const world = (id: string) => (id === "60" ? map : undefined);

describe("checkCoherence", () => {
  it("accepts a position inside a known map", () => {
    expect(checkCoherence(save, world)).toEqual({ ok: true });
  });

  it("refuses a respawn point on an unknown map", () => {
    expect(checkCoherence({ ...save, respawn: { area: "9999", x: 0, y: 0 } }, world)).toMatchObject({ ok: false });
    expect(checkCoherence({ ...save, respawn: { area: "60", x: 0, y: 0 } }, world)).toEqual({ ok: true });
  });

  it("refuses a caught species that was never seen", () => {
    const result = checkCoherence({ ...save, pokedex: { seen: [16], caught: [16, 19] } }, world);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("pokedex.caught");
  });

  it("refuses a queued item for a party member that does not exist", () => {
    const result = checkCoherence({ ...save, pending: [{ kind: "evolve", member: 0, into: 156 }] }, world);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("pending");
  });

  it("refuses an unknown area", () => {
    expect(checkCoherence({ ...save, area: "9999" }, world)).toMatchObject({ ok: false });
  });

  it.each([{ x: -1 }, { x: 321 }, { y: -1 }, { y: 241 }])("refuses %o outside the map", (patch) => {
    expect(checkCoherence({ ...save, ...patch }, world)).toMatchObject({ ok: false });
  });

  it("runs extra rules, such as an impossible level (SC-004 until the party exists)", () => {
    const withLevel = { ...save, level: 500 };
    const levelRule: CoherenceRule<typeof withLevel> = (s) => (s.level >= 1 && s.level <= 100 ? undefined : `level: ${s.level} fora de 1..100`);
    const rules: CoherenceRule<typeof withLevel>[] = [...COHERENCE_RULES, levelRule];
    const result = checkCoherence(withLevel, world, rules);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("level");
  });
});

describe("flyPointsRule (spec 025)", () => {
  const rules = [...COHERENCE_RULES, flyPointsRule([{ map: 60 }, { map: 67 }])];

  it("accepts visited fly points that exist", () => {
    expect(checkCoherence({ ...save, flyPoints: ["60", "67"] }, world, rules)).toEqual({ ok: true });
  });

  it("refuses an area that is no fly point", () => {
    const result = checkCoherence({ ...save, flyPoints: ["60", "33"] }, world, rules);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("flyPoints");
  });
});
