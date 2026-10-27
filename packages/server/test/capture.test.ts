import { BUTTON, type ServerMessage, type WorldMap } from "@soulsilver/shared/game";
import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { combatData, SPECIES } from "./combat-fixture";
import { setup } from "./harness";
import { grassMap, px, STILL_AI, wildData } from "./wild-fixture";

// Spec 015 US3: aimed Poké Balls, the Gen 4 roll, who catches first and where the catch goes.

/** One grass tile at (10, 5); players stand on row 5 and throw along it. */
const WORLD: Record<string, WorldMap> = { route: grassMap("route", (x, y) => x === 10 && y === 5) };
/** Spawns in plain sight, one at a time, never despawning. */
const NEAR = { spawn: { viewHalfTiles: { x: 0, y: 0 }, viewMarginTiles: 0, defaultCap: 1, despawnSeconds: 600 } };
const POKE = 4;
const MASTER = 1;
const member = (species = SPECIES.chikorita.id): PartyMember => ({ species, level: 10, moves: [33], hp: 30, friendship: 70, experience: 1000, ivs: { hp: 31, attack: 31, defense: 31, speed: 31, specialAttack: 31, specialDefense: 31 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });

function game(opts: { catchRate?: number; tiles?: number[]; saves?: Partial<Save>[] } = {}) {
  const tiles = opts.tiles ?? [7];
  const t = setup({ world: (id) => WORLD[id], timeoutTicks: 1e9, combat: combatData(), wild: wildData(NEAR, opts.catchRate ?? 255), ai: STILL_AI(), hour: () => 12, spawn: (n) => ({ area: "route", x: px(tiles[n - 1]!), y: px(5) }) });
  const ps = tiles.map((_, i) => t.connect(undefined, undefined, { save: { bag: [{ item: POKE, count: 5 }], ...opts.saves?.[i] } }));
  const seqs = ps.map(() => 0);
  const wild = () => t.session.world.all().find((e) => e.kind === "pokemon" && e.data["owner"] === "wild");
  const msgs = <T extends ServerMessage["type"]>(i: number, type: T) => ps[i]!.got.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  return {
    ...t,
    ps,
    wild,
    msgs,
    /** Every player in `who` presses throw toward the wild Pokémon, on the same tick. */
    throwAll(who: number[]) {
      const w = wild()!;
      for (const i of who) {
        const e = t.entity(ps[i]!.welcome!.entityId)!;
        const d = Math.hypot(w.x - e.x, w.y - e.y);
        ps[i]!.conn.send({ type: "input", seq: seqs[i]!++, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.throw, aim: { x: (w.x - e.x) / d, y: (w.y - e.y) / d } });
      }
      t.session.step();
      for (const i of who) ps[i]!.conn.send({ type: "input", seq: seqs[i]!++, move: { x: 0, y: 0 }, run: false, buttons: 0 });
    },
    run(ticks: number) {
      for (let i = 0; i < ticks; i++) t.session.step();
    },
  };
}

describe("capture (US3)", () => {
  it("catches with a Master Ball after three shakes, into the party, and records it", () => {
    const g = game({ saves: [{ bag: [{ item: MASTER, count: 1 }] }] });
    g.run(2);
    const species = g.wild()!.data["species"];
    g.throwAll([0]);
    g.run(20 * 5);
    expect(g.msgs(0, "capture").at(-1)).toMatchObject({ player: g.ps[0]!.welcome!.playerId, ball: MASTER, shakes: 3, caught: true });
    expect(g.msgs(0, "captured").at(-1)).toEqual({ type: "captured", species, to: "party" });
    expect(g.msgs(0, "pokedex").at(-1)).toMatchObject({ caught: [species] });
    expect(g.msgs(0, "bag").at(-1)).toEqual({ type: "bag", items: [] });
    g.session.close("closed-by-host");
    const save = g.ps[0]!.saves().at(-1)!.save;
    expect(save.party.at(-1)).toMatchObject({ species, moves: [33] });
    expect(save.pokedex.caught).toContain(species);
  });

  it("sends a catch to storage when the party is full", () => {
    const g = game({ saves: [{ bag: [{ item: MASTER, count: 1 }], party: Array.from({ length: 6 }, () => member()) }] });
    g.run(2);
    g.throwAll([0]);
    g.run(20 * 5);
    expect(g.msgs(0, "captured").at(-1)).toMatchObject({ to: "storage" });
    g.session.close("closed-by-host");
    expect(g.ps[0]!.saves().at(-1)!.save.storage).toHaveLength(1);
  });

  it("does not throw with the party and the storage full", () => {
    const g = game({ saves: [{ party: Array.from({ length: 6 }, () => member()), storage: Array.from({ length: 30 }, () => member()) }] });
    g.run(2);
    g.throwAll([0]);
    expect(g.msgs(0, "notice").at(-1)).toEqual({ type: "notice", code: "storage-full" });
    expect(g.session.world.all().some((e) => e.kind === "projectile")).toBe(false);
  });

  it("tells a player with no balls", () => {
    const g = game({ saves: [{ bag: [] }] });
    g.run(2);
    g.throwAll([0]);
    expect(g.msgs(0, "notice").at(-1)).toEqual({ type: "notice", code: "no-balls" });
  });

  it("uses up a ball that misses: no wild Pokémon in reach, it flies the way the thrower faces", () => {
    const g = game({ tiles: [1] });
    g.run(2);
    g.ps[0]!.conn.send({ type: "input", seq: 0, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.throw });
    g.run(20 * 2);
    expect(g.msgs(0, "bag").at(-1)).toEqual({ type: "bag", items: [{ item: POKE, count: 4 }], selected: POKE });
    expect(g.msgs(0, "capture")).toEqual([]);
  });

  it("lets the Pokémon escape on a failed roll", () => {
    const g = game({ catchRate: 1 });
    g.run(2);
    const id = g.wild()!.id;
    g.throwAll([0]);
    g.run(20 * 5);
    expect(g.msgs(0, "capture").at(-1)).toMatchObject({ wildId: id, caught: false });
    expect(g.wild()?.id).toBe(id);
  });

  it("gives the Pokémon to whoever hits first; the other ball comes back", () => {
    // Same distance on both sides: both balls land on the same tick, the lower player id wins.
    const g = game({ tiles: [7, 13], saves: [{ bag: [{ item: MASTER, count: 1 }] }, { bag: [{ item: MASTER, count: 1 }] }] });
    g.run(2);
    g.throwAll([0, 1]);
    g.run(20 * 5);
    expect(g.msgs(0, "captured")).toHaveLength(1);
    expect(g.msgs(1, "captured")).toHaveLength(0);
    expect(g.msgs(1, "notice").at(-1)).toEqual({ type: "notice", code: "ball-returned" });
    expect(g.msgs(1, "bag").at(-1)).toMatchObject({ items: [{ item: MASTER, count: 1 }] });
    expect(g.msgs(1, "capture").at(-1)).toMatchObject({ player: g.ps[0]!.welcome!.playerId });
  });

  it("puts the Pokémon back when the thrower leaves during the shakes", () => {
    const g = game({ tiles: [7, 13], saves: [{ bag: [{ item: MASTER, count: 1 }] }] });
    g.run(2);
    const id = g.wild()!.id;
    g.throwAll([1]);
    g.run(6);
    expect(g.msgs(1, "capture")).toHaveLength(1);
    g.ps[1]!.conn.send({ type: "leave" });
    g.run(20 * 5);
    expect(g.wild()?.id).toBe(id);
  });

  it("selects another ball in the bag, and ignores one not in it", () => {
    const g = game({ saves: [{ bag: [{ item: POKE, count: 5 }, { item: MASTER, count: 1 }] }] });
    g.ps[0]!.conn.send({ type: "select-ball", item: MASTER });
    g.ps[0]!.conn.send({ type: "select-ball", item: 2 });
    expect(g.msgs(0, "bag").at(-1)).toMatchObject({ selected: MASTER });
  });

  it("catches a knocked-out wild Pokémon with a Poké Ball", () => {
    const g = game();
    g.run(2);
    const id = g.wild()!.id;
    g.session.combat!.get(id)!.hp = 0;
    g.run(1);
    g.throwAll([0]);
    g.run(20 * 5);
    expect(g.msgs(0, "capture").at(-1)).toMatchObject({ ball: POKE, caught: true });
    expect(g.msgs(0, "captured")).toHaveLength(1);
    expect(g.session.world.get(id)).toBeUndefined();
  });
});

describe("auto-aim", () => {
  it("a ball aimed the wrong way still flies at the nearest wild Pokémon: players never aim", () => {
    const g = game({ saves: [{ bag: [{ item: MASTER, count: 1 }] }] });
    g.run(2);
    g.ps[0]!.conn.send({ type: "input", seq: 0, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.throw, aim: { x: -1, y: 0 } });
    g.run(1);
    g.ps[0]!.conn.send({ type: "input", seq: 1, move: { x: 0, y: 0 }, run: false, buttons: 0 });
    g.run(20 * 5);
    expect(g.msgs(0, "captured")).toHaveLength(1);
  });
});
