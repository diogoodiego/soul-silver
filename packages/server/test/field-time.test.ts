import type { ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { combatData, SPECIES } from "./combat-fixture";
import { setup } from "./harness";
import { grassMap, px, wildData } from "./wild-fixture";

// Spec 026, US1 and layer 2: one clock for the whole session. Day to night changes the band, the
// spawn table and the clock every player sees, at once and the same for all.

const WORLD = { route: grassMap("route", (x) => x >= 30) };
const clocks = (got: ServerMessage[]) => got.filter((m): m is Extract<ServerMessage, { type: "clock" }> => m.type === "clock");

function game(players: number) {
  let now = new Date(2026, 10, 2, 15, 0);
  const t = setup({ world: (id) => WORLD[id as keyof typeof WORLD], timeoutTicks: 1e9, combat: combatData(), wild: wildData(), now: () => now, spawn: (n) => ({ area: "route", x: px(5 + n), y: px(5) }) });
  const ps = Array.from({ length: players }, () => t.connect());
  const wilds = () => t.session.world.all().filter((e) => e.kind === "pokemon" && e.data["owner"] === "wild");
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) t.session.step();
  };
  return { t, ps, wilds, run, setNow: (d: Date) => (now = d) };
}

describe("the session's clock (spec 026, US1)", () => {
  it("tells every player the time as they join", () => {
    const g = game(2);
    for (const p of g.ps) expect(clocks(p.got).at(0)).toEqual({ type: "clock", minuteOfDay: 15 * 60, weekday: 1, fixed: false });
  });

  it.each([2, 4])("turns day into night for all %i players: band, spawns and clock", (players) => {
    const g = game(players);
    g.run(20 * 60);
    const daytime = new Set(g.wilds().map((w) => w.id));
    expect(daytime.size).toBeGreaterThan(0);
    for (const w of g.wilds()) expect([SPECIES.sentret.id, SPECIES.rattata.id]).toContain(w.data["species"]);

    g.setNow(new Date(2026, 10, 2, 22, 0));
    g.run(20 * 60);
    const born = g.wilds().filter((w) => !daytime.has(w.id));
    expect(born.length).toBeGreaterThan(0);
    for (const w of born) expect(w.data["species"]).toBe(SPECIES.hoothoot.id);
    for (const p of g.ps) expect(clocks(p.got).at(-1)).toEqual({ type: "clock", minuteOfDay: 22 * 60, weekday: 1, fixed: false });
  });

  it("sends the clock again every 5 seconds, not every tick", () => {
    const g = game(1);
    const before = clocks(g.ps[0]!.got).length;
    g.run(20 * 10);
    expect(clocks(g.ps[0]!.got).length - before).toBe(2);
  });
});
