import { describe, expect, it } from "vitest";
import { at, mapEvents, scriptData, scriptFile, story } from "./scripts-fixture";

// Item 034.4: the Hall of Fame (map 306, 825:0) keeps the team in the save, and the credits leave the player home. Synthetic.

const MEMBER = { species: 155, level: 50, moves: [33], hp: 100, friendship: 70, experience: 0, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };

function hall() {
  const file = scriptFile(100, ["L1:", ["HallOfFameAnim", { num: 0x800c }], ["HOFCredits", { arg0: 0 }], ["End"]]);
  const talker = { id: 0, x: 1, z: 0, sprite: 1, movement: 0, type: 0, hideFlag: 0, facing: 1, param: [0, 0, 0], trainer: null, script: { id: 1, file: 100, entry: 0 } };
  const data = { ...scriptData([file], { 60: mapEvents({ npcs: [talker] as never }), 64: mapEvents({ map: 64 }) }), newGame: { map: 64, tx: 6, ty: 6, facing: "south" as const, initScript: 0 } };
  const t = story(data, { spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
  const party = [{ ...MEMBER, nickname: "Fogo" }, { ...MEMBER, species: 16, level: 40 }, { ...MEMBER, species: 175, egg: { cycles: 10 } }];
  const a = t.connect("A", undefined, { save: { party, facing: "north" } });
  t.step(2);
  return { t, a };
}

describe("Hall of Fame (item 034.4)", () => {
  it("keeps the team but its eggs, then the credits take the player home", () => {
    const { t, a } = hall();
    t.press(a);
    t.step(20);
    const e = t.session.world.get(a.welcome!.entityId)!;
    expect(e.area).toBe("64");
    t.session.close("closed-by-host");
    const fame = a.saves().at(-1)!.save.hallOfFame;
    expect(fame).toHaveLength(1);
    expect(fame![0]!.party).toEqual([
      { species: 155, level: 50, nickname: "Fogo" },
      { species: 16, level: 40 },
    ]);
  });
});
