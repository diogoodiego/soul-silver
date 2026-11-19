import { BUTTON, type CollisionMap, type ServerMessage, type WorldMap } from "@soulsilver/shared/game";
import type { CollisionCell } from "@soulsilver/shared/maps";
import type { PartyMember } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { setup } from "./harness";

// Spec 014: the companion follows its trainer, and the rules around a fight (FR-001 to FR-025).

const open: CollisionCell = { category: "free", raw: 0 };
const grid: CollisionMap = { width: 40, height: 40, tiles: Array<CollisionCell>(1600).fill(open) };
const map = (id: string, extra: Partial<WorldMap> = {}): WorldMap => ({ id, levels: [grid], warps: [], neighbors: [], widthPx: 640, heightPx: 640, ...extra });
/** "town" has a door at tile (10, 5) into Pokémon Center "69", whose mat at (3, 30) leads back. */
const WORLD: Record<string, WorldMap> = {
  town: map("town", { areaType: "outdoor", warps: [{ tx: 10, ty: 5, destMap: "69", destAnchor: 0 }] }),
  "69": map("69", { areaType: "indoor", warps: [{ tx: 3, ty: 30, destMap: "town", destAnchor: 0 }] }),
  cave: map("cave", { areaType: "cave" }),
};
const lookup = (id: string) => WORLD[id] ?? map(id);

const member = (species: keyof typeof SPECIES, level = 10, hp = 999): PartyMember => ({ species: SPECIES[species].id, level, moves: [MOVES.tackle.id], hp, friendship: 70, experience: 1000, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });

function game(party: PartyMember[], at = { area: "town", x: 160, y: 160 }, extra: { money?: number; respawn?: { area: string; x: number; y: number } } = {}) {
  const t = setup({ world: lookup, combat: combatData(), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: () => at });
  const p = t.connect("Gold", undefined, { save: { party, ...extra } });
  const trainerId = p.welcome!.entityId;
  let seq = 0;
  const send = (move: { x: number; y: number }, buttons = 0) => p.conn.send({ type: "input", seq: seq++, move, run: false, buttons });
  const companion = () => t.session.world.all().find((e) => e.data["role"] === "companion" || (e.kind === "pokemon" && e.data["owner"] === String(p.welcome!.playerId)));
  const msgs = <T extends ServerMessage["type"]>(type: T) => p.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  return {
    ...t,
    p,
    trainer: () => t.entity(trainerId)!,
    trainerId,
    companion,
    msgs,
    /** One tick with this input. */
    tick(move = { x: 0, y: 0 }, buttons = 0) {
      send(move, buttons);
      t.session.step();
    },
    walk(move: { x: number; y: number }, ticks: number) {
      for (let i = 0; i < ticks; i++) this.tick(move);
    },
    press(button: number) {
      this.tick({ x: 0, y: 0 }, button);
      this.tick();
    },
    lastSave: () => p.saves().at(-1)?.save,
  };
}

const EAST = { x: 1, y: 0 };

describe("companion (US1)", () => {
  it("is the first party member that has not fainted", () => {
    const g = game([member("cyndaquil", 10, 0), member("chikorita")]);
    g.walk(EAST, 10);
    expect(g.companion()?.data["species"]).toBe(SPECIES.chikorita.id);
  });

  it("nobody follows when the whole party fainted", () => {
    const g = game([member("cyndaquil", 10, 0)]);
    g.walk(EAST, 10);
    expect(g.companion()).toBeUndefined();
  });

  it("follows one tile behind along the trail, facing the way it walks, and stops with the trainer", () => {
    const g = game([member("cyndaquil")]);
    g.walk(EAST, 20);
    const t = g.trainer();
    const c = g.companion()!;
    expect(c).toMatchObject({ area: "town", y: t.y, facing: "east", data: { role: "companion", owner: String(g.p.welcome!.playerId) } });
    expect(t.x - c.x).toBeCloseTo(16);
    g.walk({ x: 0, y: 0 }, 5);
    expect(g.companion()!.x).toBe(c.x);
  });

  it("follows through a warp and appears next to the trainer at the destination", () => {
    const g = game([member("cyndaquil")], { area: "town", x: 10 * 16 + 8, y: 7 * 16 + 8 });
    g.walk({ x: 0, y: -1 }, 30);
    expect(g.trainer().area).toBe("69");
    expect(g.companion()?.area).toBe("69");
    expect(Math.hypot(g.companion()!.x - g.trainer().x, g.companion()!.y - g.trainer().y)).toBeLessThanOrEqual(16);
  });

  it("a large Pokémon (Onix) goes back to its ball in a Pokémon Center and comes out again outside", () => {
    const g = game([member("onix")], { area: "town", x: 10 * 16 + 8, y: 7 * 16 + 8 });
    g.walk({ x: 0, y: -1 }, 2);
    expect(g.companion()).toBeDefined();
    g.walk({ x: 0, y: -1 }, 28);
    expect(g.trainer().area).toBe("69");
    expect(g.companion()).toBeUndefined();
    // Back down onto the mat at (3, 30).
    g.walk({ x: 0, y: 1 }, 60);
    expect(g.trainer().area).toBe("town");
    g.walk({ x: 0, y: 1 }, 10);
    expect(g.companion()?.area).toBe("town");
  });

  it("entering a Pokémon Center does not change the respawn point; the nurse does (spec 023)", () => {
    const g = game([member("cyndaquil")], { area: "town", x: 10 * 16 + 8, y: 7 * 16 + 8 });
    g.walk({ x: 0, y: -1 }, 30);
    g.walk({ x: 0, y: 0 }, 600);
    expect(g.lastSave()?.respawn ?? null).toBeNull();
  });

  it("reappears behind the trainer when left too far behind", () => {
    const g = game([member("cyndaquil")]);
    g.walk(EAST, 10);
    const c = g.companion()!;
    g.session.world.update({ ...c, x: c.x - 200 });
    g.tick();
    expect(Math.hypot(g.companion()!.x - g.trainer().x, g.companion()!.y - g.trainer().y)).toBeLessThanOrEqual(16);
  });
});

describe("chosen follower (quick swap on the field)", () => {
  const choose = (g: ReturnType<typeof game>, partyIndex: number) => {
    g.p.conn.send({ type: "set-follower", partyIndex });
    g.tick();
  };

  it("makes the chosen member follow without changing the party order, and tells the client who leads", () => {
    const g = game([member("cyndaquil"), member("chikorita")]);
    g.walk(EAST, 10);
    choose(g, 1);
    g.walk(EAST, 5);
    expect(g.companion()?.data["species"]).toBe(SPECIES.chikorita.id);
    const last = g.msgs("party").at(-1)!;
    expect(last.members.map((m) => m.species)).toEqual([SPECIES.cyndaquil.id, SPECIES.chikorita.id]);
    expect(last).toMatchObject({ lead: 1 });
  });

  it("sends the chosen member out when a fight starts", () => {
    const g = game([member("cyndaquil"), member("chikorita")]);
    choose(g, 1);
    g.press(BUTTON.combat);
    expect(g.msgs("party").at(-1)).toMatchObject({ active: 1 });
  });

  it("ignores a fainted member or one past the party", () => {
    const g = game([member("cyndaquil"), member("chikorita", 10, 0)]);
    choose(g, 1);
    choose(g, 5);
    g.walk(EAST, 5);
    expect(g.companion()?.data["species"]).toBe(SPECIES.cyndaquil.id);
  });

  it("keeps following the same member after the party is reordered", () => {
    const g = game([member("cyndaquil"), member("chikorita"), member("sentret")]);
    choose(g, 2);
    g.p.conn.send({ type: "reorder-party", from: 2, to: 0 });
    g.tick();
    g.walk(EAST, 5);
    expect(g.companion()?.data["species"]).toBe(SPECIES.sentret.id);
    expect(g.msgs("party").at(-1)).toMatchObject({ lead: 0 });
  });
});

describe("combat (US2)", () => {
  it("the combat button steps the companion forward and hands it control on the next tick", () => {
    const g = game([member("cyndaquil")]);
    g.walk(EAST, 10);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    const c = g.companion()!;
    expect(g.msgs("control").at(-1)).toEqual({ type: "control", entityId: c.id });
    expect(c.x).toBeGreaterThan(g.trainer().x);
    expect(g.session.combat!.get(c.id)?.owner).toBe(g.p.welcome!.playerId);
    expect(g.trainer().data["inCombat"]).toBe(true);
    const before = c.y;
    g.walk({ x: 0, y: 1 }, 5);
    expect(g.companion()!.y).toBeGreaterThan(before);
  });

  it("comes out of the ball when the combat button is pressed indoors (Onix)", () => {
    const g = game([member("onix")], { area: "69", x: 160, y: 160 });
    g.walk(EAST, 5);
    expect(g.companion()).toBeUndefined();
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    expect(g.companion()).toBeDefined();
  });

  it("the trainer stands still while the Pokémon moves in 8 directions", () => {
    const g = game([member("cyndaquil")]);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    const t = g.trainer();
    const before = g.companion()!;
    g.walk({ x: 0.7071, y: 0.7071 }, 5);
    expect(g.trainer()).toMatchObject({ x: t.x, y: t.y });
    expect(g.companion()!.x).toBeGreaterThan(before.x);
    expect(g.companion()!.y).toBeGreaterThan(before.y);
  });

  it("never goes past the combat radius, even when pushing against it", () => {
    const g = game([member("cyndaquil")]);
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    const t = g.trainer();
    for (const move of [EAST, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0.7071, y: -0.7071 }]) {
      for (let i = 0; i < 60; i++) {
        g.tick(move);
        const c = g.companion()!;
        expect(Math.hypot(c.x - t.x, c.y - t.y)).toBeLessThanOrEqual(6 * 16 + 1e-9);
      }
    }
  });

  it("keeps a wild foe that came inside the circle there too, and leaves one outside alone", () => {
    const g = game([member("cyndaquil")]);
    const foe = withFoe(g);
    const far = withFoe(g);
    const t = g.trainer();
    const farAt = { ...g.entity(far)!, x: t.x + 300 };
    g.session.world.update(farAt);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    // Knocked far out of the circle: back on its edge on the next tick.
    g.session.world.update({ ...g.entity(foe)!, x: t.x + 400 });
    g.tick();
    expect(Math.hypot(g.entity(foe)!.x - t.x, g.entity(foe)!.y - t.y)).toBeCloseTo(6 * 16);
    expect(g.entity(far)!.x).toBe(farAt.x);
  });

  it("recall brings the Pokémon back behind the trainer and control back to the trainer", () => {
    const g = game([member("cyndaquil")]);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.press(BUTTON.recall);
    expect(g.msgs("control").at(-1)).toEqual({ type: "control", entityId: g.trainerId });
    expect(g.companion()?.data["role"]).toBe("companion");
    expect(g.trainer().data["inCombat"]).toBeUndefined();
    const t = g.trainer();
    g.walk(EAST, 3);
    expect(g.trainer().x).toBeGreaterThan(t.x);
  });

  it("ends by itself when no foe comes near for the disengage time", () => {
    const g = game([member("cyndaquil")]);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.walk({ x: 0, y: 0 }, 99);
    expect(g.trainer().data["inCombat"]).toBe(true);
    g.walk({ x: 0, y: 0 }, 2);
    expect(g.trainer().data["inCombat"]).toBeUndefined();
  });

  it("does nothing with no Pokémon able to fight", () => {
    const g = game([member("cyndaquil", 10, 0)]);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    expect(g.msgs("control")).toHaveLength(0);
  });
});

/** A wild foe next to the trainer keeps the fight going. */
function withFoe(g: ReturnType<typeof game>) {
  const foe = g.session.world.add({ kind: "pokemon", area: g.trainer().area, x: g.trainer().x + 48, y: g.trainer().y, level: 0, facing: "west", data: {} });
  g.session.combat!.spawn(g.session.world, foe.id, { species: SPECIES.sentret.id, level: 2, moves: [MOVES.growl.id] }, "wild");
  return foe.id;
}

describe("swap, faint and blackout (US3)", () => {
  it("a swap brings out the other Pokémon, leaves the party order alone and starts a cooldown", () => {
    const g = game([member("cyndaquil"), member("chikorita"), member("rattata")]);
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.p.conn.send({ type: "swap", partyIndex: 1 });
    g.tick();
    const c = g.companion()!;
    expect(g.session.combat!.get(c.id)?.species).toBe(SPECIES.chikorita.id);
    expect(g.msgs("party").at(-1)).toMatchObject({ active: 1, members: [{ species: SPECIES.cyndaquil.id }, { species: SPECIES.chikorita.id }, { species: SPECIES.rattata.id }] });
    // Cooldown: a second swap right away is ignored.
    g.p.conn.send({ type: "swap", partyIndex: 2 });
    g.tick();
    expect(g.session.combat!.get(g.companion()!.id)?.species).toBe(SPECIES.chikorita.id);
    g.walk({ x: 0, y: 0 }, 60);
    g.p.conn.send({ type: "swap", partyIndex: 2 });
    g.tick();
    expect(g.session.combat!.get(g.companion()!.id)?.species).toBe(SPECIES.rattata.id);
  });

  it("cannot be controlled while coming out of the ball", () => {
    const g = game([member("cyndaquil"), member("chikorita")]);
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.p.conn.send({ type: "swap", partyIndex: 1 });
    g.tick();
    const at = g.companion()!.y;
    g.walk({ x: 0, y: 1 }, 5);
    expect(g.companion()!.y).toBe(at);
    g.walk({ x: 0, y: 1 }, 10);
    expect(g.companion()!.y).toBeGreaterThan(at);
  });

  it("ignores swaps to a fainted member or outside combat", () => {
    const g = game([member("cyndaquil"), member("chikorita", 10, 0)]);
    g.p.conn.send({ type: "swap", partyIndex: 1 });
    g.tick();
    expect(g.msgs("control")).toHaveLength(0);
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.p.conn.send({ type: "swap", partyIndex: 1 });
    g.tick();
    expect(g.session.combat!.get(g.companion()!.id)?.species).toBe(SPECIES.cyndaquil.id);
  });

  it("a fainted Pokémon goes back to its ball and the player picks the next one", () => {
    const g = game([member("cyndaquil"), member("chikorita")]);
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.session.combat!.get(g.companion()!.id)!.hp = 0;
    g.tick();
    expect(g.msgs("fainted").at(-1)).toEqual({ type: "fainted", partyIndex: 0, canContinue: true });
    expect(g.companion()).toBeUndefined();
    g.p.conn.send({ type: "swap", partyIndex: 1 });
    g.tick();
    expect(g.session.combat!.get(g.companion()!.id)?.species).toBe(SPECIES.chikorita.id);
  });

  it("after a faint, recalling flees and the next Pokémon follows", () => {
    const g = game([member("cyndaquil"), member("chikorita")]);
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.session.combat!.get(g.companion()!.id)!.hp = 0;
    g.tick();
    g.press(BUTTON.recall);
    expect(g.trainer().data["inCombat"]).toBeUndefined();
    g.walk(EAST, 3);
    expect(g.companion()?.data["species"]).toBe(SPECIES.chikorita.id);
  });

  it("blackout: back at the last Pokémon Center, Gen 4 money loss, party healed", () => {
    const g = game([member("cyndaquil", 12), member("chikorita", 7, 0)], { area: "town", x: 160, y: 160 }, { money: 3000, respawn: { area: "69", x: 56, y: 40 } });
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.session.combat!.get(g.companion()!.id)!.hp = 0;
    g.tick();
    expect(g.msgs("fainted").at(-1)).toMatchObject({ canContinue: false });
    expect(g.msgs("blackout").at(-1)).toEqual({ type: "blackout", moneyLost: 12 * 8, area: "69" });
    expect(g.trainer()).toMatchObject({ area: "69", x: 56, y: 40 });
    expect(g.msgs("control").at(-1)).toEqual({ type: "control", entityId: g.trainerId });
    g.walk({ x: 0, y: 0 }, 600);
    const save = g.lastSave()!;
    expect(save.money).toBe(3000 - 96);
    expect(save.party.every((m) => m.hp > 0)).toBe(true);
  });

  it("blackout without a Pokémon Center visited sends the player home", () => {
    const g = game([member("cyndaquil", 5)], { area: "town", x: 160, y: 160 }, { money: 10 });
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.session.combat!.get(g.companion()!.id)!.hp = 0;
    g.tick();
    expect(g.msgs("blackout").at(-1)).toMatchObject({ moneyLost: 10, area: "60" });
    expect(g.trainer().area).toBe("60");
  });

  it("a fight's HP stays in the party", () => {
    const g = game([member("cyndaquil")]);
    withFoe(g);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.session.combat!.get(g.companion()!.id)!.hp = 7;
    g.press(BUTTON.recall);
    g.walk({ x: 0, y: 0 }, 600);
    expect(g.lastSave()!.party[0]!.hp).toBe(7);
  });

  it("caps party HP from the save at the maximum for the level", () => {
    const g = game([member("cyndaquil", 10, 999)]);
    expect(g.msgs("party").at(-1)!.members[0]!.hp).toBe(g.msgs("party").at(-1)!.members[0]!.hpMax);
  });
});

describe("interaction (US4)", () => {
  it("turns trainer and companion to face each other and sends a reaction from the catalog bank", () => {
    const g = game([member("cyndaquil")]);
    g.walk(EAST, 20);
    g.press(BUTTON.interact);
    expect(g.trainer().facing).toBe("west");
    expect(g.companion()!.facing).toBe("east");
    const r = g.msgs("reaction").at(-1)!;
    expect(r).toMatchObject({ bank: 265, species: SPECIES.cyndaquil.id, companionId: g.companion()!.id });
  });

  it("picks reactions by place", () => {
    const route = game([member("cyndaquil")], { area: "route", x: 160, y: 160 });
    route.walk(EAST, 20);
    route.press(BUTTON.interact);
    expect([157, 159]).toContain(route.msgs("reaction").at(-1)!.text);
    const cave = game([member("cyndaquil")], { area: "cave", x: 160, y: 160 });
    cave.walk(EAST, 20);
    cave.press(BUTTON.interact);
    expect(cave.msgs("reaction").at(-1)!.text).toBe(17);
  });

  it("does nothing in combat", () => {
    const g = game([member("cyndaquil")]);
    withFoe(g);
    g.walk(EAST, 20);
    g.tick({ x: 0, y: 0 }, BUTTON.combat);
    g.press(BUTTON.interact);
    expect(g.msgs("reaction")).toHaveLength(0);
  });
});

describe("contact (touching a wild Pokémon)", () => {
  const foeAt = (g: ReturnType<typeof game>, dx: number, hp?: number) => {
    const foe = g.session.world.add({ kind: "pokemon", area: g.trainer().area, x: g.trainer().x + dx, y: g.trainer().y, level: 0, facing: "west", data: {} });
    const c = g.session.combat!.spawn(g.session.world, foe.id, { species: SPECIES.sentret.id, level: 2, moves: [MOVES.growl.id] }, "wild");
    if (hp !== undefined) c.hp = hp;
    return foe.id;
  };

  it("walking into a wild Pokémon starts the fight without the combat button", () => {
    const g = game([member("cyndaquil")]);
    foeAt(g, 40);
    g.walk({ x: 1, y: 0 }, 12);
    expect(g.trainer().data["inCombat"]).toBe(true);
    expect(g.msgs("control").length).toBeGreaterThan(0);
  });

  it("a wild Pokémon a few tiles away starts nothing", () => {
    const g = game([member("cyndaquil")]);
    foeAt(g, 64);
    g.walk({ x: 0, y: 0 }, 10);
    expect(g.trainer().data["inCombat"]).toBeUndefined();
  });

  it("touching a knocked-out one starts nothing", () => {
    const g = game([member("cyndaquil")]);
    foeAt(g, 12, 0);
    g.walk({ x: 0, y: 0 }, 10);
    expect(g.trainer().data["inCombat"]).toBeUndefined();
  });
});
