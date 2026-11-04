import { describe, expect, it } from "vitest";
import { at, fieldStory, mon, obstacle } from "./field-fixture";

// Spec 025 US1: Strength pushes boulders while it is on; Rock Climb carries the player up the wall;
// Waterfall and Whirlpool are faced from the water only. Each needs its badge and move.

const STRENGTH = 70;
const ROCK_CLIMB = 431;
const PLAIN = 1 << 2;
const EARTH = 1 << 15;

type Test = ReturnType<typeof fieldStory>;
type Client = ReturnType<Test["connect"]>;

function answerAll(t: Test, c: Client) {
  for (let answered = 0; t.of(c, "script").length > answered; answered++) {
    c.conn.send({ type: "script-answer", id: t.of(c, "script").at(-1)!.id, answer: 0 });
    t.step(12);
  }
}

const tileOf = (t: Test, c: Client) => {
  const e = t.entity(c.welcome!.entityId)!;
  return { x: Math.floor(e.x / 16), y: Math.floor(e.y / 16) };
};

/** Where this client last saw the person, in tiles. */
function personTile(t: Test, c: Client, person: number) {
  const id = [...t.session.world.all()].find((e) => e.kind === "npc" && e.data["person"] === person)!.id;
  const last = { x: 0, y: 0 };
  for (const e of c.states().flatMap((s) => [...s.spawned, ...s.changed])) if (e.id === id) Object.assign(last, "x" in e ? { x: e.x } : {}, "y" in e ? { y: e.y } : {});
  return { x: Math.floor(last.x / 16), y: Math.floor(last.y / 16) };
}

describe("Strength (spec 025)", () => {
  const boulder = obstacle(5, 1, 3, 10002);
  const scene = (save: object, raw: Record<string, number> = {}) => {
    const t = fieldStory([boulder], raw, { spawn: (n) => ({ area: "60", x: at(n === 1 ? 1 : 5), y: at(2) }) });
    const a = t.connect("A", undefined, { save });
    const b = t.connect("B");
    t.step(2);
    return { t, a, b };
  };

  it("after using Strength, walking into the boulder pushes it a tile, for that player only", () => {
    const { t, a, b } = scene({ party: [mon([STRENGTH])], badgeSet: PLAIN });
    t.press(a);
    answerAll(t, a);
    t.walk(a, { x: 0, y: 1 }, 6);
    // Held down, the push goes on a tile at a time with the boulder just ahead.
    const pushed = personTile(t, a, 5);
    expect(pushed.y).toBeGreaterThan(3);
    expect(pushed).toEqual({ x: 1, y: tileOf(t, a).y + 1 });
    expect(personTile(t, b, 5)).toEqual({ x: 1, y: 3 });
  });

  it("does not push without Strength on, or into a wall", () => {
    const off = scene({ party: [mon([STRENGTH])], badgeSet: PLAIN });
    off.t.walk(off.a, { x: 0, y: 1 }, 6);
    expect(personTile(off.t, off.a, 5)).toEqual({ x: 1, y: 3 });
    const wall = scene({ party: [mon([STRENGTH])], badgeSet: PLAIN }, { "1,4": 0x8000 });
    wall.t.press(wall.a);
    answerAll(wall.t, wall.a);
    wall.t.walk(wall.a, { x: 0, y: 1 }, 6);
    expect(personTile(wall.t, wall.a, 5)).toEqual({ x: 1, y: 3 });
  });

  it("without the badge Strength does not turn on", () => {
    const { t, a } = scene({ party: [mon([STRENGTH])], badgeSet: 0 });
    t.press(a);
    answerAll(t, a);
    t.walk(a, { x: 0, y: 1 }, 6);
    expect(personTile(t, a, 5)).toEqual({ x: 1, y: 3 });
  });
});

describe("Rock Climb (spec 025)", () => {
  // A wall two tiles high below the player: the rock-climb behavior without the blocked flag, as in the ROM.
  const wall = { "1,2": 0x004b, "1,3": 0x004b };
  const scene = (save: object) => {
    const t = fieldStory([], wall, { spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
    const a = t.connect("A", undefined, { save });
    t.step(2);
    return { t, a };
  };

  it("climbs the wall to the tile past it", () => {
    const { t, a } = scene({ party: [mon([ROCK_CLIMB])], badgeSet: EARTH });
    t.press(a);
    answerAll(t, a);
    expect(t.of(a, "script").at(-1)!.request).toMatchObject({ kind: "cutscene", steps: [{ kind: "walk", dir: "south", count: 3 }] });
    expect(tileOf(t, a)).toEqual({ x: 1, y: 4 });
  });

  it("is a wall to walking", () => {
    const { t, a } = scene({ party: [mon([ROCK_CLIMB])], badgeSet: EARTH });
    t.walk(a, { x: 0, y: 1 }, 20);
    expect(tileOf(t, a)).toEqual({ x: 1, y: 1 });
  });

  it("stays put without the badge or the move", () => {
    for (const save of [{ party: [mon([ROCK_CLIMB])], badgeSet: 0 }, { party: [mon([33])], badgeSet: EARTH }]) {
      const { t, a } = scene(save);
      t.press(a);
      answerAll(t, a);
      expect(tileOf(t, a)).toEqual({ x: 1, y: 1 });
    }
  });
});

describe("Waterfall and Whirlpool (spec 025)", () => {
  it("are not offered from land", () => {
    const t = fieldStory([], { "1,2": 0x8013 }, { spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
    const a = t.connect("A", undefined, { save: { party: [mon([127])], badgeSet: 0xffff } });
    t.step(2);
    t.press(a);
    expect(t.of(a, "script")).toEqual([]);
  });

  it("climbs a waterfall from the water", () => {
    // The player stands on water (surfing comes with US2); the waterfall is the two tiles below.
    const t = fieldStory([], { "1,1": 0x0015, "1,2": 0x0013, "1,3": 0x0013 }, { spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
    const a = t.connect("A", undefined, { save: { party: [mon([127])], badgeSet: 1 << 7 } });
    t.step(2);
    t.press(a);
    answerAll(t, a);
    expect(tileOf(t, a)).toEqual({ x: 1, y: 4 });
  });
});
