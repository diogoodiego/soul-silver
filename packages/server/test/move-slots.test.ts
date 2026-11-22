import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { combatData, MOVES } from "./combat-fixture";
import { setup } from "./harness";

// Block C: on join, members' moves are fitted to 2 normal + 2 special slots; the extra ones are kept as forgotten.

const stats = { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 };
const member = (moves: number[], extra: Partial<PartyMember> = {}): PartyMember => ({ species: 155, level: 20, moves, hp: 50, friendship: 70, experience: 8000, ivs: stats, evs: stats, nature: 0, ...extra });

describe("fitting moves on join (block C)", () => {
  it("sorts normals first and forgets the oldest extra ones, PP Ups with their move", () => {
    const { tackle, scratch, ember, growl, hyperBeam } = MOVES;
    const t = setup({ combat: combatData(), spawn: () => ({ area: "a", x: 160, y: 160 }) });
    const party = [member([tackle.id, scratch.id, ember.id, growl.id], { ppUps: [1, 2, 3, 0] }), member([hyperBeam.id, tackle.id])];
    const p = t.connect("Gold", undefined, { save: { party } });
    t.session.close("closed-by-host");
    const saved = p.saves().at(-1)!.save.party;
    expect(saved[0]).toMatchObject({ moves: [scratch.id, ember.id, growl.id], ppUps: [2, 3, 0], forgottenMoves: [tackle.id] });
    expect(saved[1]!.moves).toEqual([tackle.id, hyperBeam.id]);
    expect(saved[1]!.forgottenMoves).toBeUndefined();
  });
});
