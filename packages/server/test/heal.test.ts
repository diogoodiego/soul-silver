import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { combatData, SPECIES } from "./combat-fixture";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 023 US2: the nurse's script heals the party and makes that Center the blackout respawn
// point, where the player stands; only the healed player changes.

const nurse = scriptFile(100, ["L1:", ["HealParty"], ["End"]]);
const data = () => scriptData([nurse], { 60: mapEvents({ npcs: [npc(0, 1, 2, 0)] }) });

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const mon = (species: number, hp: number): PartyMember => ({ species, level: 5, moves: [33], hp, friendship: 70, experience: 125, ivs: stats(31), evs: stats(0), nature: 0 });

describe("healing at the Pokémon Center (US2)", () => {
  it("restores every member's HP and records where the player stands as the respawn point", () => {
    const t = story(data(), { combat: combatData() });
    const c = t.connect(undefined, undefined, { save: { party: [mon(SPECIES.chikorita.id, 3), mon(SPECIES.chikorita.id, 0)], respawn: null } });
    t.step();
    t.press(c);
    t.session.close("closed-by-host");
    const save = c.saves().at(-1)!.save;
    expect(save.party.every((m) => m.hp > 3)).toBe(true);
    expect(save.respawn).toEqual({ area: "60", x: at(1), y: at(1) });
  });

  it("changes only the healed player", () => {
    const t = story(data(), { combat: combatData() });
    const a = t.connect(undefined, undefined, { save: { party: [mon(SPECIES.chikorita.id, 3)], respawn: null } });
    const b = t.connect(undefined, undefined, { save: { party: [mon(SPECIES.chikorita.id, 3)], respawn: null } });
    t.step();
    t.press(a);
    t.session.close("closed-by-host");
    expect(b.saves().at(-1)!.save).toMatchObject({ respawn: null, party: [{ hp: 3 }] });
  });
});
