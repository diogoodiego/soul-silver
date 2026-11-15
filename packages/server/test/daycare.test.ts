import { expForLevel } from "@soulsilver/shared/progression";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { buildProgressionData } from "../src/progression";
import { mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 029, item 029.1 (layer 2): the Day Care through the server. A synthetic script in the shape of the
// lady's (scr_seq 265): leave a member, walk, take it back for 100 plus 100 per level. The Day Care is in the save.

const v = (id: number) => ({ variable: id });
const stats = (n: number) => ({ hp: n, attack: n, defense: n, speed: n, specialAttack: n, specialDefense: n });
const PIDGEY = 16;
const progression = buildProgressionData({
  species: [
    { id: 155, baseStats: stats(40), baseExperience: 62, evYield: stats(0), growthRate: "medium-slow", baseFriendship: 70 },
    { id: PIDGEY, baseStats: stats(40), baseExperience: 50, evYield: stats(0), growthRate: "medium-fast", baseFriendship: 70 },
  ],
  learnsets: [
    { id: 155, levelUp: [{ level: 1, move: 33 }], machines: [] },
    { id: PIDGEY, levelUp: [{ level: 1, move: 33 }, { level: 6, move: 28 }], machines: [] },
  ],
  evolutions: [],
});
const member = (species: number, level: number, extra: Partial<PartyMember> = {}): PartyMember => ({
  species,
  level,
  moves: [33],
  hp: 15,
  friendship: 70,
  experience: expForLevel(species === PIDGEY ? "medium-fast" : "medium-slow", level),
  ivs: stats(0),
  evs: stats(0),
  nature: 0,
  ...extra,
});
/** Level 5 with 200 experience: 16 steps short of level 6 (216). */
const pidge = member(PIDGEY, 5, { nickname: "Pidge", experience: 200 });

// Empty: pick a member and leave it. One there: take it back, paying.
const lady = scriptFile(100, [
  "L1:",
  ["GetDaycareState", { arg0: 0x800c }],
  ["CompareVarToValue", { var: v(0x800c), val: 2 }],
  ["GoToIf", { condition: 1, dest: { label: "L2" } }],
  ["ScrCmd_551", { arg0: 0x800c }],
  ["ScrCmd_552", { arg0: 0x8000, arg1: 0x800c }],
  ["CompareVarToValue", { var: v(0x8000), val: 255 }],
  ["GoToIf", { condition: 1, dest: { label: "L4" } }],
  ["PutMonInDaycare", { arg0: 0x8000 }],
  "L4:",
  ["End"],
  "L2:",
  ["SetVar", { var: v(0x8001), val: 0 }],
  ["BufferDaycareWithdrawCost", { arg0: 0x8004, arg1: 0x8001 }],
  ["HasEnoughMoneyVar", { var: v(0x800c), amount: 0x8004 }],
  ["CompareVarToValue", { var: v(0x800c), val: 1 }],
  ["GoToIf", { condition: 1, dest: { label: "L3" } }],
  ["End"],
  "L3:",
  ["RetrieveDaycareMon", { arg0: 0x8002, arg1: 0x8001 }],
  ["SubMoneyVar", { var: v(0x8004) }],
  ["End"],
]);

/** On a free 16×16 map, from tile (1,1): the lady is south at (1,2), a second one at (0,3) by the west wall. */
function dayCare(money = 3000) {
  const t = story(scriptData([lady], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0), npc(1, 0, 3, 0)] }) }), { progression });
  const a = t.connect(undefined, undefined, { save: { party: [member(155, 5), pidge], money } });
  t.step();
  const talk = (answer?: number) => {
    t.press(a);
    const asked = t.of(a, "script").at(-1);
    if (answer !== undefined && asked?.request.kind === "party") {
      a.conn.send({ type: "script-answer", id: asked.id, answer });
      t.step(2);
    }
  };
  /** Into the north wall, the east wall, the west wall, then down to the second lady: 1 + 14 + 15 + 2 tiles. */
  const walkAround = () => {
    t.walk(a, { x: 0, y: -1 }, 60);
    t.walk(a, { x: 1, y: 0 }, 400);
    t.walk(a, { x: -1, y: 0 }, 400);
    t.walk(a, { x: 0, y: 1 }, 60);
  };
  const done = () => {
    t.session.close("closed-by-host");
    return a.saves().at(-1)!.save;
  };
  return { talk, walkAround, done };
}

describe("Day Care (spec 029)", () => {
  it("leaves the member picked, and the save keeps it with no steps", () => {
    const { talk, done } = dayCare();
    talk(1);
    const s = done();
    expect(s.party.map((m) => m.species)).toEqual([155]);
    expect(s.daycare).toEqual([{ mon: pidge, steps: 0 }]);
  });

  it("cancelling leaves nothing", () => {
    const { talk, done } = dayCare();
    talk(6);
    const s = done();
    expect(s.daycare).toEqual([]);
    expect(s.party).toHaveLength(2);
  });

  it("counts one step per tile walked", () => {
    const { talk, walkAround, done } = dayCare();
    talk(1);
    walkAround();
    expect(done().daycare[0]!.steps).toBe(32);
  });

  it("gives it back grown for 100 plus 100 per level gained", () => {
    const { talk, walkAround, done } = dayCare();
    talk(1);
    walkAround();
    talk();
    const s = done();
    // 200 + 32 = 232: level 6, one level, 200 money; it learns the level 6 move.
    expect(s.daycare).toEqual([]);
    expect(s.money).toBe(2800);
    expect(s.party.at(-1)).toMatchObject({ species: PIDGEY, nickname: "Pidge", level: 6, experience: 232, moves: [33, 28] });
  });

  it("keeps the Pokémon when the wallet is short", () => {
    const { talk, done } = dayCare(50);
    talk(1);
    talk();
    const s = done();
    expect(s.money).toBe(50);
    expect(s.daycare.map((d) => d.mon.species)).toEqual([PIDGEY]);
  });
});
