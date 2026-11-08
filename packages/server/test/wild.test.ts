import type { Entity, StateMessage, WorldMap } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { combatData, SPECIES } from "./combat-fixture";
import { setup } from "./harness";
import { aiData, grassMap, px, wildData } from "./wild-fixture";

// Spec 015: wild Pokémon spawn from the map's table, outside every view, shared by everyone (US1, US2, US4).

/** Grass on the east half; the player starts on the west side. */
const WORLD: Record<string, WorldMap> = {
  route: grassMap("route", (x) => x >= 30),
  bare: grassMap("bare", () => false),
  quiet: grassMap("quiet", (x) => x >= 30, { encounters: undefined }),
  cave: grassMap("cave", () => false, { areaType: "cave" }),
};
const lookup = (id: string) => WORLD[id];

function game(options: { hour?: number; area?: string; wild?: ReturnType<typeof wildData>; ai?: ReturnType<typeof aiData>; players?: number } = {}) {
  const t = setup({ world: lookup, timeoutTicks: 1e9, combat: combatData(), wild: options.wild ?? wildData(), ai: options.ai, now: () => new Date(2026, 10, 1, options.hour ?? 12), spawn: (n) => ({ area: options.area ?? "route", x: px(5 + n), y: px(5) }) });
  const ps = Array.from({ length: options.players ?? 1 }, () => t.connect());
  const wilds = () => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) t.session.step();
  };
  return { ...t, ps, wilds, run };
}

const tileOf = (e: Entity) => ({ x: Math.floor(e.x / 16), y: Math.floor(e.y / 16) });

describe("spawner (US1)", () => {
  it("spawns day species up to the cap", () => {
    const g = game({ wild: wildData({ spawn: { despawnSeconds: 600 } }) });
    g.run(20 * 60);
    const wilds = g.wilds();
    expect(wilds.length).toBe(6);
    for (const w of wilds) expect([SPECIES.sentret.id, SPECIES.rattata.id]).toContain(w.data["species"]);
    expect(g.logs.filter((l) => l.startsWith("Wild"))).toEqual([]);
  });

  it("fills an empty map fast and slows down near the cap", () => {
    const g = game({ wild: wildData({ spawn: { despawnSeconds: 600, defaultCap: 6, spawnIntervalMinSeconds: 0.5, spawnIntervalSeconds: 4 } }) });
    const ticksOf: number[] = [];
    for (let t = 1; t <= 20 * 30 && ticksOf.length < 6; t++) {
      g.run(1);
      if (g.wilds().length > ticksOf.length) ticksOf.push(t);
    }
    const gaps = ticksOf.slice(1).map((t, i) => t - ticksOf[i]!);
    // The wait after an attempt follows the count it saw: 0 of 6 → 0.5 s; 4 of 6 (before the 6th) → 0.5 + 3.5 × 4/6 ≈ 2.8 s; at the cap, 4 s.
    expect(gaps[0]).toBe(10);
    expect(gaps.at(-1)).toBe(57);
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
  });

  it("puts each spawn on a grass cell out of view", () => {
    const g = game();
    const seen = new Set<number>();
    for (let i = 0; i < 20 * 30; i++) {
      g.run(1);
      const trainer = g.entity(g.ps[0]!.welcome!.entityId)!;
      for (const w of g.wilds()) {
        if (seen.has(w.id)) continue;
        seen.add(w.id);
        expect(tileOf(w).x).toBeGreaterThanOrEqual(30);
        expect(Math.abs(w.x - trainer.x) > 10 * 16 || Math.abs(w.y - trainer.y) > 8 * 16).toBe(true);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it("spawns only night species at night", () => {
    const g = game({ hour: 22 });
    g.run(20 * 60);
    expect(g.wilds().length).toBeGreaterThan(0);
    for (const w of g.wilds()) expect(w.data["species"]).toBe(SPECIES.hoothoot.id);
  });

  it.each(["bare", "quiet"])("spawns nothing on %s (no grass, or no encounter table)", (area) => {
    const g = game({ area });
    g.run(20 * 60);
    expect(g.wilds()).toEqual([]);
  });

  it("spawns on the free floor of a cave", () => {
    const g = game({ area: "cave" });
    g.run(20 * 30);
    expect(g.wilds().length).toBeGreaterThan(0);
  });

  it("removes them once no player has been near for despawnSeconds", () => {
    const g = game();
    g.run(20 * 30);
    const before = g.wilds().map((w) => w.id);
    expect(before.length).toBeGreaterThan(0);
    const trainer = g.entity(g.ps[0]!.welcome!.entityId)!;
    g.session.world.update({ ...trainer, area: "bare" });
    g.run(20 * 31);
    expect(g.wilds()).toEqual([]);
  });

  it("shines when the shiny roll hits", () => {
    const g = game({ wild: wildData({ spawn: { shinyOdds: 1 } }) });
    g.run(20 * 10);
    expect(g.wilds().length).toBeGreaterThan(0);
    for (const w of g.wilds()) expect(w.data["shiny"]).toBe(true);
  });
});

describe("temperaments (US2, driven by the spec 019 AI)", () => {
  const distance = (g: ReturnType<typeof game>) => {
    const t = g.entity(g.ps[0]!.welcome!.entityId)!;
    return Math.min(...g.wilds().map((w) => Math.hypot(w.x - t.x, w.y - t.y)));
  };
  /** Sees across the whole map, so the out-of-view spawn notices the player. */
  const farSight = aiData({ tuning: { performance: { dormantTiles: 64 } }, profiles: { sightTiles: 60, sightAngleDeg: 360 }, temperaments: { aggressive: { chaseLimitTiles: 60 }, skittish: { chaseLimitTiles: 60 } } });
  const only = (temperament: string, spawn: object = {}) => wildData({ spawn: { defaultCap: 1, ...spawn }, temperaments: { default: temperament, species: {} } });

  it("an aggressive one comes for the player", () => {
    const g = game({ wild: only("aggressive", { leashTiles: 64 }), ai: farSight });
    g.run(5);
    const start = distance(g);
    g.run(20 * 3);
    expect(distance(g)).toBeLessThan(start - 32);
  });

  it("an aggressive one shows the alert when it notices the player (specs 018, 019)", () => {
    const g = game({ wild: only("aggressive", { leashTiles: 64 }), ai: farSight });
    let alert = false;
    for (let i = 0; i < 20; i++) {
      g.run(1);
      alert ||= g.wilds()[0]?.data["alert"] === true;
    }
    expect(alert).toBe(true);
  });

  it("a passive one never shows the alert", () => {
    const g = game({ wild: only("passive", { leashTiles: 64 }), ai: farSight });
    for (let i = 0; i < 30; i++) {
      g.run(1);
      expect(g.wilds()[0]?.data["alert"]).toBeUndefined();
    }
  });

  it("a skittish one runs away", () => {
    const g = game({ wild: only("skittish", { leashTiles: 64 }), ai: farSight });
    g.run(5);
    const start = distance(g);
    g.run(20 * 3);
    expect(distance(g)).toBeGreaterThan(start + 32);
  });

  it("knows only moves from its learnset", () => {
    const g = game();
    g.run(20 * 10);
    for (const w of g.wilds()) expect(g.session.combat!.get(w.id)!.moves.map((m) => m.id)).toEqual([33]);
  });
});

describe("shared (US4)", () => {
  it("two players see the same wild Pokémon in the same place", () => {
    const g = game({ players: 2 });
    g.run(20 * 20);
    const view = (got: StateMessage[]) => {
      const entities = new Map<number, Record<string, unknown> & { data?: Entity["data"] }>();
      for (const s of got) {
        for (const e of s.spawned) entities.set(e.id, { ...e });
        for (const d of s.changed) entities.set(d.id, { ...entities.get(d.id), ...d, data: { ...entities.get(d.id)?.data, ...d.data } });
        for (const id of s.removed) entities.delete(id);
      }
      return [...entities.values()].filter((e) => e.data?.["owner"] === "wild").map((e) => ({ id: e.id, x: e.x, y: e.y, species: e.data!["species"], shiny: e.data!["shiny"] ?? false }));
    };
    const a = view(g.ps[0]!.states());
    expect(a.length).toBeGreaterThan(0);
    expect(view(g.ps[1]!.states())).toEqual(a);
  });

  it("marks the species seen in the player's Pokédex", () => {
    const g = game();
    g.run(20 * 20);
    const dex = g.ps[0]!.got.filter((m) => m.type === "pokedex").at(-1);
    const species = new Set(g.wilds().map((w) => w.data["species"]));
    expect(dex?.type === "pokedex" && dex.seen).toEqual(expect.arrayContaining([...species]));
  });
});

describe("knocked out", () => {
  const knockOut = (g: ReturnType<typeof game>) => {
    const w = g.wilds()[0]!;
    g.session.combat!.get(w.id)!.hp = 0;
    return w.id;
  };

  it("stays where it fell, does nothing, and goes after faintedSeconds", () => {
    const g = game({ wild: wildData({ spawn: { defaultCap: 1, faintedSeconds: 2 } }) });
    g.run(5);
    const id = knockOut(g);
    const at = { x: g.entity(id)!.x, y: g.entity(id)!.y };
    g.run(20);
    expect(g.entity(id)).toMatchObject({ ...at, data: expect.objectContaining({ hp: 0 }) as object });
    g.run(25);
    expect(g.entity(id)).toBeUndefined();
  });
});
