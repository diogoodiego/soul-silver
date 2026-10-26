import type { ServerMessage, WorldMap } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { combatData } from "./combat-fixture";
import { setup } from "./harness";
import { aiData, grassMap, px, wildData } from "./wild-fixture";

// Spec 019 US6 (FR-033): the overlay data goes only to clients that asked, about the AIs near them.

/** Grass right next to the player, so the spawn is in range. */
const WORLD: Record<string, WorldMap> = { route: grassMap("route", (x) => x >= 8 && x <= 12) };

function game() {
  const t = setup({
    world: (id) => WORLD[id],
    timeoutTicks: 1e9,
    combat: combatData(),
    wild: wildData({ spawn: { defaultCap: 2, viewHalfTiles: { x: 0, y: 0 }, viewMarginTiles: 0 } }),
    ai: aiData(),
    hour: () => 12,
    spawn: () => ({ area: "route", x: px(5), y: px(5) }),
  });
  const p = t.connect();
  const run = (n: number) => {
    for (let i = 0; i < n; i++) t.session.step();
  };
  const rows = () => p.got.filter((m): m is Extract<ServerMessage, { type: "aiDebug" }> => m.type === "aiDebug");
  return { ...t, p, run, rows };
}

describe("AI debug overlay data (US6)", () => {
  it("is not sent to a client that did not ask", () => {
    const g = game();
    g.run(40);
    expect(g.rows()).toEqual([]);
  });

  it("is sent at 4 Hz once asked, with state, target, sight, zone and scores", () => {
    const g = game();
    g.p.conn.send({ type: "debugAi", on: true });
    g.run(40);
    expect(g.rows().length).toBeGreaterThanOrEqual(7);
    expect(g.rows().length).toBeLessThanOrEqual(9);
    const last = g.rows().at(-1)!;
    expect(last.ais.length).toBeGreaterThan(0);
    const row = last.ais[0]!;
    expect(row.sight.rangePx).toBeGreaterThan(0);
    expect(row.zone.radiusPx).toBeGreaterThan(0);
    expect(Array.isArray(row.scores)).toBe(true);
    expect(g.session.world.get(row.entityId)?.data["owner"]).toBe("wild");
  });

  it("stops when turned off", () => {
    const g = game();
    g.p.conn.send({ type: "debugAi", on: true });
    g.run(20);
    g.p.conn.send({ type: "debugAi", on: false });
    const before = g.rows().length;
    g.run(40);
    expect(g.rows().length).toBe(before);
  });

  it("only carries AIs within the debug radius", () => {
    const g = game();
    g.p.conn.send({ type: "debugAi", on: true });
    g.run(40);
    const me = g.entity(g.p.welcome!.entityId)!;
    for (const m of g.rows()) for (const a of m.ais) {
      const e = g.session.world.get(a.entityId);
      if (e) expect(Math.hypot(e.x - me.x, e.y - me.y)).toBeLessThanOrEqual(20 * 16 + 16);
    }
  });
});
