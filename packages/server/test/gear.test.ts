import type { PhoneBook } from "@soulsilver/shared/phone";
import type { ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { at, mapEvents, scriptData, story } from "./scripts-fixture";

// Spec 026, T047 (layer 2): the Pokégear's map shows this player's visited places and where the others of the
// session stand, nothing private of theirs; with it open the player counts as in a menu, so calls wait.

const BOOK: PhoneBook = {
  contacts: [{ id: 1, type: 2, trainerClass: 201, trainer: 0, map: 61, gift: 0, localScript: 1, rematchWeekday: 7, rematchTime: 3, tier: 0, greeting: 255, bank: 716, outgoing: [], incoming: [] }],
  scripts: [{ id: 2, lines: [33, 34], type: 0, param0: 0, param1: 0 }],
  greetings: [], rematchSets: [],
};
const data = () => ({ ...scriptData([], { 60: mapEvents() }), phone: BOOK });
type Gear = Extract<ServerMessage, { type: "gear-map" }>;

describe("the Pokégear (spec 026, US3)", () => {
  it("opening it sends the map, the phone and the radio; the map has the others' names and places only", () => {
    const t = story(data());
    const a = t.connect("A", undefined, { save: { flyPoints: ["60", "33"] } });
    const b = t.connect("B", undefined, { save: { money: 4321, flyPoints: ["67"] } });
    t.step();
    a.conn.send({ type: "gearOpen" });
    t.step();
    const map = t.of(a, "gear-map").at(-1) as Gear;
    expect(map.visited).toEqual(["60", "33"]);
    const me = t.entity(b.welcome!.entityId)!;
    expect(map.others).toEqual([{ name: "B", area: me.area, x: me.x, y: me.y }]);
    expect(JSON.stringify(map)).not.toMatch(/4321|67/);
    expect(t.of(a, "phone-state").length).toBeGreaterThan(0);
    expect(t.of(a, "radio-state").at(-1)).toMatchObject({ tuned: null });
  });

  it("keeps the map fresh while open and stops when closed", () => {
    const t = story(data());
    const a = t.connect("A");
    t.connect("B");
    a.conn.send({ type: "gearOpen" });
    t.step(41);
    const open = t.of(a, "gear-map").length;
    expect(open).toBeGreaterThanOrEqual(3);
    a.conn.send({ type: "gearClose" });
    t.step(60);
    expect(t.of(a, "gear-map").length).toBe(open);
  });

  it("a call waits while the Pokégear is open", () => {
    const t = story(data(), { spawn: () => ({ area: "60", x: at(1), y: at(1) }) });
    const a = t.connect("A", undefined, { save: { phone: { contacts: [1], seeking: [], called: [], pending: [{ caller: 1, call: 2 }], log: [] } } });
    t.step();
    a.conn.send({ type: "gearOpen" });
    for (const dir of [1, -1, 1]) t.walk(a, { x: dir, y: 0 }, 70);
    expect(t.of(a, "phone-call")).toHaveLength(0);
    a.conn.send({ type: "gearClose" });
    t.step(2);
    expect(t.of(a, "phone-call")).toHaveLength(1);
  });
});
