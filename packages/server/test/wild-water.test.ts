import type { CollisionMap, WorldMap } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { buildWildData } from "../src/wild-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { mon } from "./field-fixture";
import { setup } from "./harness";
import { px, STILL_AI, wildContent } from "./wild-fixture";

// Spec 025 US2 (FR-009): while someone surfs, wild Pokémon come out of the water from the map's surf
// table (spec 015's spawner, cap and seeded draws); nobody surfing, the water stays empty.

const SURF = 57;
const FOG = 1 << 3;
const slot = (species: number, chance: number) => ({ species, form: 0, minLevel: 20, maxLevel: 25, chance });

function wild(surfing = 60) {
  return buildWildData(wildContent({ spawn: { despawnSeconds: 600 } }), {
    encounters: [
      {
        id: 1,
        rates: { walking: 25, surfing, rockSmash: 0, oldRod: 0, goodRod: 0, superRod: 0 },
        grass: { morning: [slot(SPECIES.sentret.id, 100)], day: [slot(SPECIES.sentret.id, 100)], night: [slot(SPECIES.sentret.id, 100)] },
        surf: [slot(SPECIES.chikorita.id, 70), slot(SPECIES.onix.id, 30)],
      },
    ],
    learnsets: Object.values(SPECIES).map((s) => ({ id: s.id, levelUp: [{ level: 1, move: MOVES.tackle.id }] })),
    species: Object.values(SPECIES).map((s) => ({ id: s.id, catchRate: 255, growthRate: "medium-fast" as const, baseFriendship: 70 })),
    evolutions: [],
  });
}

/** 60×40: water from row 10 down; above it land, with tall grass east of column 30. */
const cell = (i: number) => (i >= 600 ? { category: "water" as const, raw: 0x10 } : { category: i % 60 >= 30 ? ("tallGrass" as const) : ("free" as const), raw: 0 });
const grid: CollisionMap = { width: 60, height: 40, tiles: Array.from({ length: 2400 }, (_, i) => cell(i)) };
const LAKE: WorldMap = { id: "lake", levels: [grid], warps: [], neighbors: [], widthPx: 960, heightPx: 640, areaType: "outdoor", encounters: 1 };

function game(surfing?: number) {
  const t = setup({ world: (id) => (id === "lake" ? LAKE : undefined), timeoutTicks: 1e9, combat: combatData(), wild: wild(surfing), ai: STILL_AI(), spawn: () => ({ area: "lake", x: px(5), y: px(9) }) });
  const a = t.connect("A", undefined, { save: { party: [mon([33, SURF])], badgeSet: FOG } });
  const all = () => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");
  /** The ones on the water. */
  const wilds = () => all().filter((e) => Math.floor(e.y / 16) >= 10);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) t.session.step();
  };
  return { ...t, a, all, wilds, run };
}

describe("wild Pokémon on the water (spec 025)", () => {
  it("come from the surf table, on water, while the player surfs, with a cap of their own", () => {
    const g = game();
    g.run(2);
    g.a.conn.send({ type: "field-mount", mode: "surf" });
    g.run(20 * 60);
    const wilds = g.wilds();
    // The grass filled its own cap; the water still got its six.
    expect(g.all().length - wilds.length).toBe(6);
    expect(wilds.length).toBe(6);
    for (const w of wilds) expect([SPECIES.chikorita.id, SPECIES.onix.id]).toContain(w.data["species"]);
    for (const w of g.all().filter((e) => !wilds.includes(e))) expect(w.data["species"]).toBe(SPECIES.sentret.id);
  });

  it("come out of a pond smaller than the screen too, away from the surfer", () => {
    // 20×14 with an 8×6 pond (columns 4–11, rows 4–9): every tile of it is in view of a surfer on it.
    const pond = (i: number) => i % 20 >= 4 && i % 20 <= 11 && Math.floor(i / 20) >= 4 && Math.floor(i / 20) <= 9;
    const small: CollisionMap = { width: 20, height: 14, tiles: Array.from({ length: 280 }, (_, i) => (pond(i) ? { category: "water" as const, raw: 0x10 } : { category: "free" as const, raw: 0 })) };
    const POND: WorldMap = { id: "pond", levels: [small], warps: [], neighbors: [], widthPx: 320, heightPx: 224, areaType: "outdoor", encounters: 1 };
    const t = setup({ world: (id) => (id === "pond" ? POND : undefined), timeoutTicks: 1e9, combat: combatData(), wild: wild(), ai: STILL_AI(), spawn: () => ({ area: "pond", x: px(3), y: px(6) }) });
    const a = t.connect("A", undefined, { save: { party: [mon([33, SURF])], badgeSet: FOG } });
    a.conn.send({ type: "input", seq: 1, move: { x: 1, y: 0 }, run: false, buttons: 0 });
    t.session.step();
    a.conn.send({ type: "field-mount", mode: "surf" });
    for (let i = 0; i < 20 * 30; i++) t.session.step();
    const surfer = t.session.world.get(a.welcome!.entityId)!;
    const out = t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");
    expect(out.length).toBeGreaterThan(0);
    for (const w of out) expect(pond(Math.floor(w.x / 16) + Math.floor(w.y / 16) * 20)).toBe(true);
    expect(Math.min(...out.map((w) => Math.hypot(w.x - surfer.x, w.y - surfer.y)))).toBeGreaterThan(16);
  });

  it("never come out with nobody surfing", () => {
    const g = game();
    g.run(20 * 60);
    expect(g.wilds()).toEqual([]);
  });

  it("never come out of a map whose surfing rate is 0", () => {
    const g = game(0);
    g.run(2);
    g.a.conn.send({ type: "field-mount", mode: "surf" });
    g.run(20 * 60);
    expect(g.wilds()).toEqual([]);
  });
});
