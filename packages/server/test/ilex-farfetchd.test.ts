import { describe, expect, it } from "vitest";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 030.7: Ilex Forest's Farfetch'd (scr_seq 92) in the headless server, on a synthetic copy of its rule (principle II).
// The original decides everything from where the bird stands (GetPersonCoords) and where the player faces: from the front it
// flees along its loop; a branch stepped on turns it toward the noise; then, from behind, it is caught. Here it stands at
// (5, 5), flees 3 tiles east to (8, 5) from the front, and the branch at (10, 5) turns it east; the player at (7, 5)
// facing east is behind it.

const X = 0x4000;
const Z = 0x4001;
/** Set by the branch: the bird faces away from (7, 5). */
const TURNED = 0x4002;
/** The branch's trigger variable, armed once the bird has fled. */
const BRANCH = 0x4003;
const FACING = 0x800c;
const CAUGHT = 125;
const HIDE = 423;
const EAST = 3;

const code = scriptFile(
  100,
  [
    // The bird: at home it flees from whoever comes; at (8, 5) only a player facing east while it is turned catches it.
    "L1:",
    ["GetPersonCoords", { arg0: 0, arg1: X, arg2: Z }],
    ["CompareVarToValue", { var: { variable: X }, val: 5 }],
    ["GoToIf", { condition: 1, dest: { label: "L3" } }],
    ["GetPlayerFacing", { arg0: FACING }],
    ["CompareVarToValue", { var: { variable: FACING }, val: EAST }],
    ["GoToIf", { condition: 5, dest: { label: "L4" } }],
    ["CompareVarToValue", { var: { variable: TURNED }, val: 1 }],
    ["GoToIf", { condition: 5, dest: { label: "L4" } }],
    ["SetFlag", { flag: { flag: CAUGHT } }],
    ["SetFlag", { flag: { flag: HIDE } }],
    ["HidePerson", { arg0: 0 }],
    ["End"],
    // The branch: it turns the bird when it stands at (8, 5).
    "L2:",
    ["GetPersonCoords", { arg0: 0, arg1: X, arg2: Z }],
    ["CompareVarToValue", { var: { variable: X }, val: 8 }],
    ["GoToIf", { condition: 5, dest: { label: "L4" } }],
    ["ApplyMovement", { arg0: 0, movement: { movement: "M2" } }],
    ["WaitMovement"],
    ["SetVar", { var: { variable: TURNED }, val: 1 }],
    ["End"],
    "L3:",
    ["ApplyMovement", { arg0: 0, movement: { movement: "M1" } }],
    ["WaitMovement"],
    ["SetVar", { var: { variable: BRANCH }, val: 1 }],
    ["End"],
    "L4:",
    ["End"],
  ],
  { M1: [{ action: "WalkFastEast", count: 3 }, { action: "FaceWest", count: 1 }], M2: [{ action: "FaceEast", count: 1 }] },
);
const branch = { script: { id: 2, file: 100, entry: 1 }, x: 10, z: 5, w: 1, h: 1, y: 0, variable: BRANCH, value: 1 };

function forest() {
  const t = story(scriptData([code], { 60: mapEvents({ npcs: [npc(0, 5, 5, 0, HIDE)], triggers: [branch] }) }), { spawn: () => ({ area: "60", x: at(5), y: at(7) }) });
  const a = t.connect();
  const me = () => t.entity(a.welcome!.entityId)!;
  const tile = () => ({ x: Math.floor(me().x / 16), z: Math.floor(me().y / 16) });
  let answered = 0;
  /** Steps, answering every script request (the cutscenes) as the client does once it played them. */
  const run = (n: number) => {
    for (let i = 0; i < n; i++) {
      for (const m of t.of(a, "script").slice(answered)) a.conn.send({ type: "script-answer", id: m.id });
      answered = t.of(a, "script").length;
      t.step();
    }
  };
  const vectors = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };
  /** Walks `tiles` tiles, or into what blocks it, which turns the player that way. */
  const go = (dir: keyof typeof vectors, tiles = 1) => {
    for (let k = 0; k < tiles; k++) {
      const from = tile();
      for (let i = 0; i < 24 && tile().x === from.x && tile().z === from.z; i++) t.walk(a, vectors[dir], 1);
      // On to the tile's center, where the next turn starts clear of the people beside the way.
      // Past the center along the way it walks: a step can land beside it.
      const sub = () => (dir === "north" || dir === "south" ? me().y : me().x) % 16;
      const centered = () => (dir === "south" || dir === "east" ? sub() >= 8 : sub() <= 8);
      for (let i = 0; i < 16 && !centered(); i++) t.walk(a, vectors[dir], 1);
    }
    t.walk(a, { x: 0, y: 0 }, 4);
    run(20);
  };
  const talk = () => {
    t.press(a);
    run(60);
  };
  /** The flags of the save the session sends as it closes: the last look of a test. */
  const flags = () => {
    t.session.close("closed-by-host");
    return a.saves().at(-1)!.save.flags;
  };
  /** Where this player last saw the bird, and which way it faced. */
  const bird = () => {
    let id: number | undefined;
    let seen: { x: number; y: number; facing: string } | undefined;
    for (const s of a.states()) {
      for (const e of s.spawned) if (e.kind === "npc" && e.data["person"] === 0) [id, seen] = [e.id, { x: e.x, y: e.y, facing: e.facing }];
      for (const d of s.changed) if (d.id === id) seen = { ...seen!, ...(d as Partial<typeof seen>) };
    }
    return seen && { x: Math.floor(seen.x / 16), z: Math.floor(seen.y / 16), facing: seen.facing };
  };
  t.step(3);
  // Up to (5, 6), facing the bird from the front.
  go("north");
  talk();
  /** From (5, 6) round to (7, 5), facing east, behind the bird at (8, 5). */
  const behind = () => {
    go("east", 2);
    go("north");
    go("east");
  };
  return { t, a, run, go, talk, tile, flags, bird, behind };
}

describe("Ilex Forest's Farfetch'd (spec 030.7)", () => {
  it("from the front it flees along its loop and is not caught", () => {
    const f = forest();
    expect(f.bird()).toEqual({ x: 8, z: 5, facing: "west" });
    expect(f.flags()).not.toContain(CAUGHT);
  });

  it("from behind, without a branch stepped on, it is not caught", () => {
    const f = forest();
    f.behind();
    expect(f.tile()).toEqual({ x: 7, z: 5 });
    f.talk();
    expect(f.flags()).not.toContain(CAUGHT);
  });

  it("a branch turns it toward the noise wherever it fled; then from behind it is caught", () => {
    const f = forest();
    // East along row 6, then north onto the branch at (10, 5).
    f.go("east", 5);
    f.go("north");
    expect(f.bird()).toEqual({ x: 8, z: 5, facing: "east" });
    f.go("south");
    f.go("west", 3);
    f.go("north");
    f.go("east");
    expect(f.tile()).toEqual({ x: 7, z: 5 });
    f.talk();
    expect(f.flags()).toEqual(expect.arrayContaining([CAUGHT, HIDE]));
  });
});
