import type { ServerMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { setup } from "./harness";
import { scriptData, scriptFile, story } from "./scripts-fixture";

// Block H: the Pokédex phone's Trainer Card and Save apps.

function game() {
  const t = setup({ world: () => undefined, spawn: () => ({ area: "a", x: 160, y: 160 }) });
  const p = t.connect("Gold", undefined, { save: { trainerId: 4321, startedAt: "2026-11-01T08:00:00.000Z", money: 5000, badgeSet: 0b11, pokedex: { seen: [16, 19, 155], caught: [155] } } });
  const cards = () => p.got.filter((m): m is Extract<ServerMessage, { type: "trainer-card" }> => m.type === "trainer-card");
  const send = (msg: unknown) => {
    p.conn.send(msg);
    t.session.step();
  };
  return { ...t, p, cards, send };
}

describe("trainer card", () => {
  it("comes on joining, with what the save holds", () => {
    const g = game();
    expect(g.cards().at(-1)).toEqual({ type: "trainer-card", name: "Gold", trainerId: 4321, money: 5000, badgeSet: 0b11, playTimeMs: 0, startedAt: "2026-11-01T08:00:00.000Z", seen: 3, caught: 1, hallOfFame: 0 });
  });

  it("comes again on request, with the play time run since", () => {
    const g = game();
    for (let i = 0; i < 40; i++) g.session.step();
    g.send({ type: "trainer-card-request" });
    expect(g.cards().at(-1)!.playTimeMs).toBeGreaterThanOrEqual(40 * 50);
  });

  it("comes again when the badges change, and not on a quiet tick", () => {
    const t = story(scriptData([scriptFile(100, ["L1:", ["End"]])], {}), { devTools: true });
    const c = t.connect(undefined, undefined, { save: { badgeSet: 0b1 } });
    const cards = () => c.got.filter((m): m is Extract<ServerMessage, { type: "trainer-card" }> => m.type === "trainer-card");
    c.conn.send({ type: "debugScript", on: true });
    t.step();
    const before = cards().length;
    t.step();
    expect(cards()).toHaveLength(before);
    c.conn.send({ type: "debugGiveBadge", badge: 3 });
    t.step();
    expect(cards()).toHaveLength(before + 1);
    expect(cards().at(-1)!.badgeSet).toBe(0b1001);
  });
});

describe("save now", () => {
  it("sends a save at once, and at most one a second", () => {
    const g = game();
    const before = g.p.saves().length;
    g.send({ type: "save-now" });
    expect(g.p.saves()).toHaveLength(before + 1);
    g.send({ type: "save-now" });
    expect(g.p.saves()).toHaveLength(before + 1);
    for (let i = 0; i < 20; i++) g.session.step();
    g.send({ type: "save-now" });
    expect(g.p.saves()).toHaveLength(before + 2);
  });
});
