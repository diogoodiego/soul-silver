import { EGG_CYCLE_PX } from "@soulsilver/shared/daycare";
import { expForLevel } from "@soulsilver/shared/progression";
import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData } from "../src/progression";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 029, item 029.2 (layer 2): genders, the egg chance on the 255th step of every 256, and the man's egg,
// through the server. Synthetic species (principle II): 10 → 11 share "field" and have both genders; 12 is
// Undiscovered; 132 is Ditto; 298 → 183 is Azurill → Marill, the incense baby the original names in code.

const stats = (n: number) => ({ hp: n, attack: n, defense: n, speed: n, specialAttack: n, specialDefense: n });
const species = (id: number, gender: number, eggGroups: [string] | [string, string]) => ({ id, baseStats: stats(40), baseExperience: 50, evYield: stats(0), growthRate: "medium-fast" as const, baseFriendship: 70, gender: { kind: "mixed" as const, raw: gender }, eggGroups: eggGroups as never, hatchCycles: 20 });
const progression = buildProgressionData({
  species: [species(10, 127, ["field"]), species(11, 127, ["field"]), species(12, 255, ["undiscovered"]), species(132, 255, ["ditto"]), species(298, 191, ["field"]), species(183, 127, ["field"]), { ...species(126, 63, ["human-like"]), abilities: [49] as never }, { ...species(175, 31, ["undiscovered"]), hatchCycles: 0 }],
  learnsets: [
    { id: 10, levelUp: [{ level: 1, move: 33 }], machines: [], egg: [40] },
    { id: 11, levelUp: [{ level: 1, move: 33 }], machines: [] },
    { id: 298, levelUp: [{ level: 1, move: 33 }], machines: [] },
    { id: 175, levelUp: [{ level: 1, move: 45 }, { level: 1, move: 204 }], machines: [] },
  ],
  evolutions: [{ id: 10, evolutions: [{ method: "level-up", methodId: 4, parameter: 16, condition: { kind: "level", level: 16 }, into: 11 } as never] }, { id: 298, evolutions: [{ method: "level-up", methodId: 4, parameter: 16, condition: { kind: "level", level: 16 }, into: 183 } as never] }],
});
const mon = (id: number, gender?: "male" | "female", moves = [33]): PartyMember => ({ species: id, level: 20, moves, hp: 40, friendship: 70, experience: expForLevel("medium-fast", 20), ivs: stats(10), evs: stats(0), nature: 0, ...(gender ? { gender } : {}) });

// The man: give the egg he holds.
const man = scriptFile(100, ["L1:", ["GiveDaycareEgg"], ["End"]]);
// The hatch common script (std 2021), reduced to its command.
const hatchScript = scriptFile(3, ["L1:", ["EggHatchAnim"], ["End"]]);

function game(save: Partial<Save>, seed = 1, talk = man) {
  const t = story(scriptData([talk, hatchScript], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) }, { 2021: { file: 3, entry: 0 } }), { progression, seed });
  const a = t.connect(undefined, undefined, { save: { party: [mon(11, "male")], ...save } });
  t.step();
  const done = () => {
    t.session.close("closed-by-host");
    return a.saves().at(-1)!.save;
  };
  return { t, a, done };
}

describe("genders (spec 029.2)", () => {
  it("rolls a gender on join for members without one, by the species' ratio, and keeps the ones they have", () => {
    const { done } = game({ party: [mon(10), mon(11, "female"), mon(12)], daycare: [{ mon: mon(10), steps: 0 }] });
    const s = done();
    expect(["male", "female"]).toContain(s.party[0]!.gender);
    expect(s.party[1]!.gender).toBe("female");
    // Genderless.
    expect(s.party[2]!.gender).toBeUndefined();
    expect(["male", "female"]).toContain(s.daycare[0]!.mon.gender);
  });
});

describe("egg chance (spec 029.2)", () => {
  /** Two in the Day Care, the second at 254 steps: one tile east is its 255th. */
  const oneStep = (a: PartyMember, b: PartyMember, seed: number) => {
    const { t, a: c, done } = game({ daycare: [{ mon: a, steps: 0 }, { mon: b, steps: 254 }] }, seed);
    t.walk(c, { x: 1, y: 0 }, 6);
    const s = done();
    return { egg: s.daycareEgg, steps: s.daycare[1]!.steps };
  };

  it("rolls on the 255th step: about half the time for the same species (50), with fixed seeds", () => {
    const runs = Array.from({ length: 24 }, (_, i) => oneStep(mon(10, "male"), mon(10, "female"), i + 1));
    expect(runs.every((r) => r.steps === 255)).toBe(true);
    const eggs = runs.filter((r) => r.egg).length;
    expect(eggs).toBeGreaterThan(5);
    expect(eggs).toBeLessThan(19);
    // Same seeds, same eggs.
    expect(Array.from({ length: 24 }, (_, i) => oneStep(mon(10, "male"), mon(10, "female"), i + 1).egg)).toEqual(runs.map((r) => r.egg));
  });

  it("030.1: rolling a gender on join does not move the session's random sequence (wild spawns, catches, combat)", () => {
    const next = (lead: PartyMember) => {
      const { t, done } = game({ party: [lead] });
      const value = t.session.rng.next();
      done();
      return value;
    };
    expect(next(mon(11))).toBe(next(mon(11, "male")));
  });

  it("never with an incompatible pair: same gender, or an Undiscovered parent", () => {
    for (let seed = 1; seed <= 12; seed++) {
      expect(oneStep(mon(10, "male"), mon(11, "male"), seed).egg).toBe(false);
      expect(oneStep(mon(12), mon(132), seed).egg).toBe(false);
    }
  });

  it("not before the 255th step", () => {
    const { t, a, done } = game({ daycare: [{ mon: mon(10, "male"), steps: 0 }, { mon: mon(10, "female"), steps: 100 }] });
    t.walk(a, { x: 1, y: 0 }, 6);
    expect(done().daycareEgg).toBe(false);
  });
});

describe("the man's egg (spec 029.2)", () => {
  it("is the mother's base form at level 1, with its hatch cycles and the father's egg move, at the end of the party", () => {
    const { t, a, done } = game({ daycare: [{ mon: mon(11, "female"), steps: 0 }, { mon: mon(10, "male", [33, 40]), steps: 0 }], daycareEgg: true });
    t.press(a);
    const s = done();
    expect(s.daycareEgg).toBe(false);
    expect(s.party).toHaveLength(2);
    expect(s.party[1]).toMatchObject({ species: 10, level: 1, experience: 0, egg: { cycles: 20 }, moves: [33, 40] });
    // Not in the Pokédex until it hatches.
    expect(s.pokedex.caught).not.toContain(10);
  });

  it("029.3: the parents' held items reach the egg: Marill holding Sea Incense (254) gives Azurill, without it Marill", () => {
    const egg = (held?: number) => {
      const { t, a, done } = game({ daycare: [{ mon: { ...mon(183, "female"), ...(held ? { held } : {}) }, steps: 0 }, { mon: mon(183, "male"), steps: 0 }], daycareEgg: true });
      t.press(a);
      return done().party[1]!.species;
    };
    expect(egg(254)).toBe(298);
    expect(egg()).toBe(183);
  });
});

describe("hatching (spec 029.4)", () => {
  const egg = (cycles: number): PartyMember => ({ ...mon(10, "female"), level: 1, experience: 0, egg: { cycles } });
  /** A few px short of a full cycle, so a few ticks of walking close it. */
  const nearly = EGG_CYCLE_PX - 5;

  it("walking closes the cycle; an egg at 0 hatches through the hatch script, which waits on the animation", () => {
    const { t, a, done } = game({ party: [mon(11, "male"), egg(0)], eggWalk: nearly });
    t.walk(a, { x: 1, y: 0 }, 4);
    const asked = t.of(a, "script").at(-1);
    expect(asked?.request).toEqual({ kind: "hatch", species: 10 });
    a.conn.send({ type: "script-answer", id: asked!.id });
    t.step(2);
    const s = done();
    expect(s.party[1]).toMatchObject({ species: 10, friendship: 120 });
    expect(s.party[1]!.egg).toBeUndefined();
    expect(s.pokedex.caught).toContain(10);
    expect(s.eggWalk).toBeLessThan(16);
  });

  it("without a full cycle walked, nothing happens to the eggs", () => {
    const { t, a, done } = game({ party: [mon(11, "male"), egg(3)], eggWalk: 0 });
    t.walk(a, { x: 1, y: 0 }, 4);
    const s = done();
    expect(t.of(a, "script")).toEqual([]);
    expect(s.party[1]!.egg).toEqual({ cycles: 3 });
    expect(s.eggWalk).toBeGreaterThan(8);
  });

  it("a cycle takes one from the eggs, two with Flame Body in the party (Magmar, 126)", () => {
    const after = (lead: PartyMember) => {
      const { t, a, done } = game({ party: [lead, egg(5)], eggWalk: nearly });
      t.walk(a, { x: 1, y: 0 }, 4);
      return done().party[1]!.egg!.cycles;
    };
    expect(after(mon(11, "male"))).toBe(4);
    expect(after(mon(126, "male"))).toBe(3);
  });
});

describe("gift eggs (spec 029.5)", () => {
  // Someone who gives a Togepi egg (the synthetic Togepi hatches after one cycle).
  const aide = scriptFile(100, ["L1:", ["GiveTogepiEgg"], ["End"]]);

  it("GiveTogepiEgg gives a Togepi egg with Extrasensory, and walking hatches it", () => {
    const { t, a, done } = game({ eggWalk: EGG_CYCLE_PX - 5 }, 1, aide);
    t.press(a);
    t.walk(a, { x: 1, y: 0 }, 4);
    const asked = t.of(a, "script").at(-1);
    expect(asked?.request).toEqual({ kind: "hatch", species: 175 });
    a.conn.send({ type: "script-answer", id: asked!.id });
    t.step(2);
    const s = done();
    expect(s.party[1]).toMatchObject({ species: 175, level: 1, moves: [45, 204, 326], friendship: 120 });
    expect(s.party[1]!.egg).toBeUndefined();
    expect(s.pokedex.caught).toContain(175);
  });

  it("gives nothing with a full party", () => {
    const { t, a, done } = game({ party: Array.from({ length: 6 }, () => mon(11, "male")) }, 1, aide);
    t.press(a);
    expect(done().party.map((m) => m.species)).toEqual([11, 11, 11, 11, 11, 11]);
  });
});

describe("the Togepi from the assistant's egg (spec 030.1)", () => {
  // As the assistant's script (858:2): GiveTogepiEgg, then FLAG_GOT_EGG_FROM_ELMS_ASSISTANT (112).
  const assistant = scriptFile(100, ["L1:", ["GiveTogepiEgg"], ["SetFlag", { flag: { flag: 112 } }], ["End"]]);
  const hatch = (talk: typeof assistant, save: Partial<Save> = {}) => {
    const { t, a, done } = game({ eggWalk: EGG_CYCLE_PX - 5, ...save }, 1, talk);
    t.press(a);
    t.walk(a, { x: 1, y: 0 }, 4);
    const asked = t.of(a, "script").at(-1);
    a.conn.send({ type: "script-answer", id: asked!.id });
    t.step(2);
    return done();
  };

  it("sets FLAG_SYS_HATCHED_TOGEPI_EGG (2435) when it hatches, as sub_02093134", () => {
    expect(hatch(assistant).flags).toContain(2435);
  });

  it("not for a Togepi egg that is not the assistant's", () => {
    const other = scriptFile(100, ["L1:", ["GiveTogepiEgg"], ["End"]]);
    expect(hatch(other).flags).not.toContain(2435);
  });
});
