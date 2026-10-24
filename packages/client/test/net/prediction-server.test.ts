import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { WorldLookup, WorldMap } from "@soulsilver/shared/game";
import type { CollisionCell } from "@soulsilver/shared/maps";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { describe, expect, it } from "vitest";
import { createGameConnection } from "../../src/net/game-connection";

// SC-004: with no packet loss, the client's prediction matches the server's confirmed position.

const free: CollisionCell = { category: "free", raw: 0 };
const wall: CollisionCell = { category: "blocked", raw: 0x8000 };
const ledge: CollisionCell = { category: "ledge", raw: 0x3b, direction: "south" };
// 8 x 8 tiles: a wall column at x = 4 (rows 0-3), a south ledge row at y = 5 (columns 0-3).
const tiles = Array.from({ length: 64 }, (_, i) => {
  const [x, y] = [i % 8, Math.floor(i / 8)];
  if (x === 4 && y < 4) return wall;
  if (y === 5 && x < 4) return ledge;
  return free;
});
const map: WorldMap = { id: "a", levels: [{ width: 8, height: 8, tiles }], warps: [], neighbors: [], widthPx: 128, heightPx: 128 };
const world: WorldLookup = (id) => (id === "a" ? map : undefined);

describe("prediction against the real server", () => {
  it("agrees within 1 px walking into a wall and hopping a ledge", () => {
    const session = createSession({ seed: 1, spawn: () => ({ area: "a", x: 24, y: 24 }), world, log: () => {} });
    const [server, client] = createMemoryConnectionPair();
    let now = 0;
    const game = createGameConnection({ name: "P", protocolVersion: PROTOCOL_VERSION, send: (m) => client.send(m), world });
    client.onMessage((m) => game.receive(m, now));
    session.connect(server);
    game.start();
    session.step();

    const plan = [...Array<[number, number]>(30).fill([1, 0.3]), ...Array<[number, number]>(40).fill([0, 1])];
    for (const [x, y] of plan) {
      game.sendInput({ x, y }, false, now);
      session.step();
      now += 50;
      const confirmed = session.world.get(game.entityId!)!;
      const shown = game.view(now).self!;
      expect(Math.hypot(shown.x - confirmed.x, shown.y - confirmed.y)).toBeLessThan(1);
    }
    // The run did reach the far side of the ledge.
    expect(session.world.get(game.entityId!)!.y).toBeGreaterThan(6 * 16);
  });
});
