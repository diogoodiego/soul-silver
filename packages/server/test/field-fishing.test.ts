import { describe, expect, it } from "vitest";
import { BUNDLED_COMPANION_CONTENT, buildCompanionData } from "../src/companion-loader";
import { buildFieldData } from "../src/field";
import { buildWildData } from "../src/wild-loader";
import { combatData, MOVES, SPECIES } from "./combat-fixture";
import { at, fieldStory, mon } from "./field-fixture";
import { wildContent } from "./wild-fixture";

// Spec 025 US3 (FR-010–FR-012): fishing at the water's edge with a rod in the bag; a bite answered in
// time puts the rod's species on the nearby water, ready to fight; the companion's friendship helps.

const OLD_ROD = 445;
/** Rows 5 and below are water. */
const WATER = Object.fromEntries(Array.from({ length: 16 * 11 }, (_, i) => [`${i % 16},${5 + Math.floor(i / 16)}`, 0x10]));
const slot = (species: number) => ({ species, form: 0, minLevel: 10, maxLevel: 10, chance: 100 });

function wild() {
  return buildWildData(wildContent(), {
    encounters: [{ id: 1, rates: { walking: 0, surfing: 0, rockSmash: 0, oldRod: 25, goodRod: 0, superRod: 0 }, oldRod: [slot(SPECIES.onix.id)] }],
    learnsets: Object.values(SPECIES).map((s) => ({ id: s.id, levelUp: [{ level: 1, move: MOVES.tackle.id }] })),
    species: Object.values(SPECIES).map((s) => ({ id: s.id, catchRate: 255, growthRate: "medium-fast" as const, baseFriendship: 70 })),
    evolutions: [],
  });
}

/** Bites on every cast at friendship 255, never at 0. */
function field(baseBite: number, friendshipBite: number) {
  const data = buildFieldData();
  const rods = Object.fromEntries(Object.entries(data.fishing.rods).map(([k, r]) => [k, { ...r, baseBite }])) as typeof data.fishing.rods;
  return { ...data, fishing: { rods, friendshipBite } };
}

type Test = ReturnType<typeof fieldStory>;
type Client = ReturnType<Test["connect"]>;

function scene(save: object, { spawnY = 4, baseBite = 1, friendshipBite = 0 } = {}) {
  const t = fieldStory([], WATER, { combat: combatData(), wild: wild(), field: field(baseBite, friendshipBite), companion: buildCompanionData(BUNDLED_COMPANION_CONTENT), spawn: () => ({ area: "60", x: at(3), y: at(spawnY) }) });
  const a = t.connect("A", undefined, { save });
  t.step(3);
  return { t, a };
}

const me = (t: Test, c: Client) => t.entity(c.welcome!.entityId)!;
const last = <T extends Parameters<Test["of"]>[1]>(t: Test, c: Client, type: T) => t.of(c, type).at(-1);
const wilds = (t: Test) => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");
/** Steps until the line leaves the wait. */
function untilBite(t: Test, a: Client) {
  for (let i = 0; i < 200 && last(t, a, "field-fishing")?.state === "waiting"; i++) t.step();
  return last(t, a, "field-fishing")?.state;
}

describe("fishing (spec 025)", () => {
  const angler = { party: [mon([33])], bag: [{ item: OLD_ROD, count: 1 }] };

  it("casts at the water's edge, holds the player still and hooks a fish on the nearby water", () => {
    const { t, a } = scene(angler);
    a.conn.send({ type: "field-fish", rod: "old" });
    t.step();
    expect(last(t, a, "player-mode")).toMatchObject({ mode: "fish" });
    expect(last(t, a, "field-fishing")).toMatchObject({ state: "waiting" });
    const y = me(t, a).y;
    t.walk(a, { x: 1, y: 0 }, 5);
    expect(me(t, a).y).toBe(y);
    expect(me(t, a).x).toBe(at(3));
    expect(untilBite(t, a)).toBe("bite");
    expect(last(t, a, "field-fishing")).toMatchObject({ windowMs: 1500 });
    a.conn.send({ type: "field-reel" });
    t.step(2);
    expect(last(t, a, "field-fishing")).toMatchObject({ state: "hooked" });
    expect(last(t, a, "player-mode")).toMatchObject({ mode: "walk" });
    expect(me(t, a).data["mode"]).toBeUndefined();
    const [fish] = wilds(t);
    expect(fish?.data["species"]).toBe(SPECIES.onix.id);
    expect(Math.floor(fish!.y / 16)).toBe(5);
    expect(Math.abs(fish!.x - me(t, a).x)).toBeLessThanOrEqual(16);
  });

  it("lets the fish go when the reaction comes too late", () => {
    const { t, a } = scene(angler);
    a.conn.send({ type: "field-fish", rod: "old" });
    t.step();
    untilBite(t, a);
    t.step(40);
    a.conn.send({ type: "field-reel" });
    t.step(2);
    expect(t.of(a, "field-fishing").map((m) => m.state)).toEqual(["waiting", "bite", "escaped"]);
    expect(wilds(t)).toHaveLength(0);
    expect(me(t, a).data["mode"]).toBeUndefined();
  });

  it("is refused away from the water or without the rod", () => {
    const cases: [object, number, string][] = [
      [angler, 2, "notHere"],
      [{ ...angler, bag: [] }, 4, "notAllowed"],
    ];
    for (const [save, spawnY, reason] of cases) {
      const { t, a } = scene(save, { spawnY });
      a.conn.send({ type: "field-fish", rod: "old" });
      t.step();
      expect(last(t, a, "field-result"), reason).toMatchObject({ ok: false, reason });
      expect(me(t, a).data["mode"]).toBeUndefined();
    }
  });

  it("casts with a rod the map has no table for, and nothing bites", () => {
    const { t, a } = scene({ ...angler, bag: [{ item: 446, count: 1 }] });
    a.conn.send({ type: "field-fish", rod: "good" });
    t.step();
    expect(untilBite(t, a)).toBe("escaped");
    expect(wilds(t)).toHaveLength(0);
  });

  it("takes the friendship from the companion out of its ball, and 0 without one", () => {
    const friend = { ...angler, party: [{ ...mon([33]), friendship: 255 }] };
    const near = scene(friend, { baseBite: 0, friendshipBite: 1 });
    near.a.conn.send({ type: "field-fish", rod: "old" });
    near.t.step();
    expect(untilBite(near.t, near.a)).toBe("bite");
    // The only member has fainted: no companion, so friendship 0 and nothing bites.
    const alone = scene({ ...friend, party: [{ ...friend.party[0]!, hp: 0 }] }, { baseBite: 0, friendshipBite: 1 });
    alone.a.conn.send({ type: "field-fish", rod: "old" });
    alone.t.step();
    expect(untilBite(alone.t, alone.a)).toBe("escaped");
  });
});
