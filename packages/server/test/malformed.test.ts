import { describe, expect, it } from "vitest";
import { createRng } from "@soulsilver/shared/game";
import { setup } from "./harness";

function garbage(i: number): unknown {
  const pool: unknown[] = [
    null,
    42,
    "hello",
    [],
    {},
    { type: "input" },
    { type: "input", seq: "1", move: { x: 1, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 1, dir: "east", buttons: 0 },
    { type: "input", seq: 1, move: { x: 3, y: 0 }, run: false, buttons: 0 },
    { type: "hello", protocolVersion: 2, name: "x".repeat(10_000) },
    { type: "teleport", x: 0 },
    { type: "input", seq: -5, move: { x: 0, y: 0 }, run: false, buttons: 0 },
  ];
  return pool[i % pool.length];
}

function run(withGarbage: boolean) {
  const { session, connect, logs } = setup();
  const good = [connect(), connect(), connect()];
  const bad = connect();
  const rng = createRng(9);
  for (let t = 0; t < 100; t++) {
    good.forEach((c) => c.input(t, (["north", "south", "east", "west"] as const)[rng.nextInt(4)]!));
    if (withGarbage) for (let i = 0; i < 10; i++) bad.conn.send(garbage(t * 10 + i));
    session.step();
  }
  return { session, good, logs };
}

describe("malformed messages", () => {
  it("survives 1,000 garbage messages without affecting other clients", () => {
    const control = run(false);
    const noisy = run(true);
    expect(noisy.session.state).toBe("open");
    expect(noisy.session.tick).toBe(100);
    noisy.good.forEach((c, i) => expect(c.states()).toEqual(control.good[i]!.states()));
    expect(noisy.logs.filter((l) => l.includes("Discarded")).length).toBeGreaterThanOrEqual(1000);
  });
});
