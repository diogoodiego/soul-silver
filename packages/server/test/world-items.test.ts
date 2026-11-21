import type { ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { buildItemsData } from "../src/items";
import { TALK_COOLDOWN_TICKS } from "../src/scripts";
import { at, mapEvents, npc, scriptData, scriptFile, story } from "./scripts-fixture";

// Spec 027, US5/US6 (layer 2): items on the ground and hidden, per player (principle VII); the Dowsing MCHN;
// apricorn trees and Kurt. Script files shaped like the original's 141 (item balls), 145 (hidden), 150 (apricorns).

const NUGGET = 92;
const POTION = 17;
const DOWSING = 471;
const APRICORN_BOX = 468;
const LEVEL_BALL = 493;
const items = buildItemsData([
  { id: POTION, pocket: "medicine", partyUse: { kind: 1, params: "0000000000040000000000000014000000000000" } },
  { id: NUGGET, pocket: "items", partyUse: { kind: 0, params: "0".repeat(40) } },
  { id: DOWSING, pocket: "key-items", partyUse: { kind: 0, params: "0".repeat(40) } },
  { id: APRICORN_BOX, pocket: "key-items", partyUse: { kind: 0, params: "0".repeat(40) } },
  { id: LEVEL_BALL, pocket: "balls", partyUse: { kind: 0, params: "0".repeat(40) } },
]);

// File 141: the item ball's entry sets item and count, hides the ball and gives the item.
const ballFile = scriptFile(141, ["L1:", ["SetVar", { var: { variable: 0x8008 }, val: POTION }], ["HidePerson", { arg0: 0x800d }], ["GiveItem", { arg0: 0x8008, arg1: 1, arg2: 0x800c }], ["End"]]);
// File 145: the hidden item, its item, count and flag from 0x8000–0x8002 (GetHiddenItemParams).
const hiddenFile = scriptFile(145, ["L1:", ["GiveItem", { arg0: 0x8000, arg1: 0x8001, arg2: 0x800c }], ["SetFlagVar", { var: { variable: 0x8002 } }], ["End"]]);
// File 150: the apricorn tree.
const treeFile = scriptFile(150, [
  "L1:",
  ["AnimApricornTree", { arg0: 0x800c }],
  ["CompareVarToValue", { var: { variable: 0x800c }, val: 0 }],
  ["GoToIf", { condition: 1, dest: { label: "L2" } }],
  ["ApricornTreeGetApricorn", { arg0: 0x8000 }],
  ["GiveApricornFromTree", { arg0: 0x8000, arg1: 1, arg2: 0x800c }],
  "L2:",
  ["End"],
]);
// File 874: Kurt, cut down to his apricorn commands.
const kurtFile = scriptFile(874, [
  "L1:",
  ["ScrCmd_735", { arg0: 0x8000 }],
  ["CompareVarToValue", { var: { variable: 0x8000 }, val: 0 }],
  ["GoToIf", { condition: 5, dest: { label: "L2" } }],
  ["ScrCmd_739"],
  ["End"],
  "L2:",
  ["CheckFlag", { flag: { flag: 2722 } }],
  ["GoToIf", { condition: 1, dest: { label: "L3" } }],
  ["ScrCmd_737", { arg0: 0x8004 }],
  ["GiveItem", { arg0: 0x8004, arg1: 0x8000, arg2: 0x800c }],
  ["ClearKurtApricorn"],
  "L3:",
  ["End"],
]);

const ref = (file: number) => ({ id: 1, file, entry: 0 });
const ballAt = { ...npc(1, 1, 2, null, 900), script: ref(141) };
const tree = { ...npc(2, 3, 2, null), script: ref(150), param: [4, 0, 0] as [number, number, number] };
const kurt = { ...npc(3, 5, 2, null), script: ref(874) };
const hiddenSign = { script: { id: 8003, file: 145, entry: 0 }, kind: 2, x: 1, z: 2, y: 0, dir: 0 };

function world(now = () => new Date(2026, 10, 7, 12)) {
  const data = { ...scriptData([ballFile, hiddenFile, treeFile, kurtFile], { 60: mapEvents({ npcs: [ballAt, tree, kurt], signs: [] }), 61: mapEvents({ map: 61, signs: [hiddenSign] }) }), fieldItems: { hidden: [{ index: 3, item: NUGGET, count: 1, flag: 803 }], apricornTrees: [0, 0, 0, 0, 2], berries: [] } };
  const g = story(data, { items, now, spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
  const bag = (c: ReturnType<typeof g.connect>) => g.of(c, "bag").at(-1)?.items ?? [];
  const answer = (c: ReturnType<typeof g.connect>, value: number) => {
    const req = g.of(c, "script").at(-1)!;
    c.conn.send({ type: "script-answer", id: req.id, answer: value });
    g.step(3);
  };
  /** Faces the tile at (x, 2) from (x, 1). */
  const face = (c: ReturnType<typeof g.connect>, x: number) => {
    const e = g.entity(c.welcome!.entityId)!;
    g.session.world.update({ ...e, x: at(x), y: at(1), facing: "south" });
  };
  return { ...g, bag, answer, face };
}

describe("items on the ground (US6)", () => {
  it("an item ball picked by A is gone for A, even on coming back, and still there for B", () => {
    const g = world();
    const a = g.connect("A");
    const b = g.connect("B");
    g.step();
    g.face(a, 1);
    g.press(a);
    g.step(3);
    expect(g.bag(a)).toEqual([{ item: POTION, count: 1 }]);
    g.press(a);
    g.step(3);
    expect(g.bag(a)).toEqual([{ item: POTION, count: 1 }]);
    g.face(b, 1);
    g.press(b);
    g.step(3);
    expect(g.bag(b)).toEqual([{ item: POTION, count: 1 }]);
    g.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toContain(900);
    expect(b.saves().at(-1)!.save.flags).toContain(900);
  });

  it("a hidden item is found on its tile, once per player, with the flag the game uses", () => {
    const g = world();
    const a = g.connect("A");
    const b = g.connect("B");
    for (const c of [a, b]) g.session.world.update({ ...g.entity(c.welcome!.entityId)!, area: "61", x: at(1), y: at(1), facing: "south" });
    g.step();
    g.press(a);
    g.step(3);
    expect(g.bag(a)).toEqual([{ item: NUGGET, count: 1 }]);
    g.press(a);
    g.step(3);
    expect(g.bag(a)).toEqual([{ item: NUGGET, count: 1 }]);
    g.press(b);
    g.step(3);
    expect(g.bag(b)).toEqual([{ item: NUGGET, count: 1 }]);
    g.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save.flags).toContain(803);
  });

  it("the Dowsing MCHN points at a hidden item still there, and goes quiet once it is picked", () => {
    const g = world();
    const a = g.connect("A", undefined, { save: { bag: [{ item: DOWSING, count: 1 }] } });
    g.session.world.update({ ...g.entity(a.welcome!.entityId)!, area: "61", x: at(1), y: at(6), facing: "north" });
    a.conn.send({ type: "use-item", item: DOWSING, partyIndex: 0 });
    g.step(10);
    const dowse = g.of(a, "dowse").at(-1) as Extract<ServerMessage, { type: "dowse" }>;
    expect(dowse.dir).toBe(0);
    expect(dowse.near).toBeGreaterThan(0);
    g.session.world.update({ ...g.entity(a.welcome!.entityId)!, x: at(1), y: at(1), facing: "south" });
    g.press(a);
    g.step(10);
    expect(g.of(a, "dowse").at(-1)).toEqual({ type: "dowse" });
  });

  it("without the Dowsing MCHN no bearing is sent", () => {
    const g = world();
    const a = g.connect("A");
    g.session.world.update({ ...g.entity(a.welcome!.entityId)!, area: "61", x: at(1), y: at(6) });
    g.step(20);
    expect(g.of(a, "dowse")).toHaveLength(0);
  });
});

describe("apricorns and Kurt (US5)", () => {
  it("an apricorn tree gives its colour once a day, per player, into the Apricorn Box", () => {
    let day = new Date(2026, 10, 7, 12);
    const g = world(() => day);
    const a = g.connect("A", undefined, { save: { bag: [{ item: APRICORN_BOX, count: 1 }] } });
    const b = g.connect("B", undefined, { save: { bag: [{ item: APRICORN_BOX, count: 1 }] } });
    g.step();
    g.face(a, 3);
    g.press(a);
    g.step(3);
    g.press(a);
    g.step(3);
    expect(g.of(a, "apricorn-box").at(-1)!.counts).toEqual([0, 0, 1, 0, 0, 0, 0]);
    g.face(b, 3);
    g.press(b);
    g.step(3);
    expect(g.of(b, "apricorn-box").at(-1)!.counts).toEqual([0, 0, 1, 0, 0, 0, 0]);
    day = new Date(2026, 10, 8, 9);
    g.press(a);
    g.step(3);
    expect(g.of(a, "apricorn-box").at(-1)!.counts).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it("Kurt takes the apricorns and hands over the balls the next day, not before", () => {
    let day = new Date(2026, 10, 7, 12);
    const g = world(() => day);
    const a = g.connect("A", undefined, { save: { apricorns: [2, 0, 0, 0, 0, 0, 0] } });
    g.step();
    g.face(a, 5);
    g.press(a);
    g.step(3);
    expect(g.of(a, "script").at(-1)!.request).toEqual({ kind: "apricorn", counts: [2, 0, 0, 0, 0, 0, 0] });
    g.answer(a, 0);
    // Block H: interact talks again only once the answer's cooldown is over.
    g.step(TALK_COOLDOWN_TICKS);
    g.press(a);
    g.step(3);
    expect(g.bag(a)).toEqual([]);
    day = new Date(2026, 10, 8, 8);
    g.press(a);
    g.step(3);
    expect(g.bag(a)).toEqual([{ item: LEVEL_BALL, count: 2 }]);
    g.session.close("closed-by-host");
    expect(a.saves().at(-1)!.save).toMatchObject({ apricorns: [0, 0, 0, 0, 0, 0, 0], kurt: null });
  });
});
