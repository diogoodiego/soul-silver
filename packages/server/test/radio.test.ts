import type { ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { combatData } from "./combat-fixture";
import { setup } from "./harness";
import { grassMap, px, wildData } from "./wild-fixture";
import { createRadio } from "../src/radio";

// Spec 026, T045 (layer 2): Pokémon Music on a player's Pokégear scales the spawn cap of the area they are in
// (6 by default): March on a Monday to round(6 × 1.625) = 10, Lullaby on a Tuesday to round(6 × 0.375) = 2.
// Only the area the listener stands in, never saved.

const WORLD = { route: grassMap("route", (x) => x >= 30), far: grassMap("far", (x) => x >= 30) };
// 2026-11-01 is a Sunday.
const day = (weekday: number) => new Date(2026, 10, 1 + weekday, 12);

function game(weekday: number, areas: string[] = ["route"]) {
  const t = setup({ world: (id) => WORLD[id as keyof typeof WORLD], timeoutTicks: 1e9, combat: combatData(), wild: wildData(), now: () => day(weekday), spawn: (n) => ({ area: areas[(n - 1) % areas.length]!, x: px(5 + n), y: px(5) }) });
  const wildsIn = (area: string) => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild" && e.area === area).length;
  const most = (area: string, ticks: number) => {
    let top = 0;
    for (let i = 0; i < ticks; i++) {
      t.session.step();
      top = Math.max(top, wildsIn(area));
    }
    return top;
  };
  return { t, most };
}
const radio = (c: { got: ServerMessage[] }) => c.got.filter((m): m is Extract<ServerMessage, { type: "radio-state" }> => m.type === "radio-state");

describe("the radio and the spawns (spec 026, US3)", () => {
  it("with no music the area fills to its cap of 6", () => {
    const g = game(1);
    g.t.connect();
    expect(g.most("route", 4000)).toBe(6);
  });

  it("March on a Monday raises the cap to 10; Lullaby on a Tuesday lowers it to 2", () => {
    for (const [weekday, cap] of [[1, 10], [2, 2]] as const) {
      const g = game(weekday);
      const a = g.t.connect();
      a.conn.send({ type: "radioTune", channel: "music" });
      expect(g.most("route", 4000)).toBe(cap);
      expect(radio(a).at(-1)).toMatchObject({ tuned: "music" });
    }
  });

  it("A's radio leaves B's area alone", () => {
    const g = game(1, ["route", "far"]);
    const a = g.t.connect("A");
    g.t.connect("B");
    a.conn.send({ type: "radioTune", channel: "music" });
    expect(g.most("far", 4000)).toBe(6);
  });

  it("refuses a station that does not exist, and the station is not saved", () => {
    const g = game(1);
    const a = g.t.connect("A");
    a.conn.send({ type: "radioTune", channel: "nowhere" });
    g.t.session.step();
    expect(a.got.filter((m) => m.type === "notice").at(-1)).toEqual({ type: "notice", code: "action-refused" });
    a.conn.send({ type: "radioTune", channel: "talk" });
    g.t.session.step();
    expect(radio(a).at(-1)).toMatchObject({ tuned: "talk" });
    g.t.session.close("closed-by-host");
    expect(JSON.stringify(a.saves().at(-1)!.save)).not.toContain("talk");
  });

  it("turning it off brings the cap back", () => {
    const g = game(2);
    const a = g.t.connect();
    a.conn.send({ type: "radioTune", channel: "music" });
    expect(g.most("route", 4000)).toBe(2);
    a.conn.send({ type: "radioTune", channel: null });
    expect(g.most("route", 4000)).toBe(6);
  });
});

describe("the radio across areas (spec 026, edge case)", () => {
  const MUSIC = { gbSounds: false, nationalDex: false };

  it("goes off when the player changes area, as the field music takes over, and stays off on coming back", () => {
    const radio = createRadio({ hour: () => 10, weekday: () => 1 });
    radio.tune(1, "music", "route");
    expect(radio.factor(1, "route", MUSIC)).toBe(1.625);
    radio.at(1, "far");
    expect(radio.factor(1, "route", MUSIC)).toBe(1);
    expect(radio.state(1, "route").tuned).toBeNull();
  });

  it("keeps playing after the Pokégear is closed", () => {
    const g = game(1);
    const a = g.t.connect();
    a.conn.send({ type: "gearOpen" });
    a.conn.send({ type: "radioTune", channel: "music" });
    a.conn.send({ type: "gearClose" });
    expect(g.most("route", 4000)).toBe(10);
  });
});
