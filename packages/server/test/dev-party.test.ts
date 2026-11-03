import { describe, expect, it } from "vitest";
import { setup } from "./harness";

// Spec 024: the dev arena's party and bag fill only saves from before the playable story; a new game
// gets its starter from Prof. Elm and its Poké Balls from the catching tutorial, as the original.

const stats = { experience: 0, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
const dev = { devParty: [{ species: 155, level: 12, moves: [33], hp: 999, friendship: 70, ...stats }], devBag: [{ item: 4, count: 20 }] };

function lastSave(storyRev: number) {
  const t = setup(dev);
  const a = t.connect("A", undefined, { save: { storyRev } });
  a.conn.send({ type: "leave" });
  return a.saves().at(-1)!.save;
}

describe("dev party", () => {
  it("leaves a new game's party and bag empty", () => {
    expect(lastSave(1)).toMatchObject({ party: [], bag: [] });
  });

  it("still fills a save from before the story", () => {
    const save = lastSave(0);
    expect(save.party.map((m) => m.species)).toEqual([155]);
    expect(save.bag).toEqual([{ item: 4, count: 20 }]);
  });
});
