import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { Direction } from "@soulsilver/shared/maps";
import type { CollisionMap, ServerMessage, StateMessage, WorldLookup } from "@soulsilver/shared/game";
import { createMemoryConnectionPair } from "../src/connection";
import { createSession, type SessionOptions } from "../src/session";

const VECTORS: Record<Direction, { x: number; y: number }> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };

/** Every area is this one grid, with no neighbors or warps. */
export const flatWorld =
  (grid: CollisionMap): WorldLookup =>
  (id) => ({ id, levels: [grid], warps: [], neighbors: [], widthPx: grid.width * 16, heightPx: grid.height * 16 });

/** A session with in-memory fake clients. */
export function setup(options: Partial<SessionOptions> = {}) {
  const logs: string[] = [];
  const session = createSession({
    seed: 1,
    spawn: () => ({ area: "a", x: 24, y: 24 }),
    world: () => undefined,
    log: (m) => logs.push(m),
    ...options,
  });

  function connect(name = "P", protocolVersion = PROTOCOL_VERSION) {
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    let closed = false;
    client.onMessage((m) => got.push(m as ServerMessage));
    client.onClose(() => {
      closed = true;
    });
    session.connect(server);
    client.send({ type: "hello", protocolVersion, name });
    const welcome = got.find((m) => m.type === "welcome");
    return {
      conn: client,
      got,
      welcome: welcome?.type === "welcome" ? welcome : undefined,
      get closed() {
        return closed;
      },
      input(seq: number, dir: Direction | null, run = false) {
        client.send({ type: "input", seq, move: dir ? VECTORS[dir] : { x: 0, y: 0 }, run, buttons: 0 });
      },
      states: () => got.filter((m): m is StateMessage => m.type === "state"),
      lastState: () => got.filter((m): m is StateMessage => m.type === "state").at(-1),
    };
  }

  const entity = (id: number) => session.world.get(id);

  return { session, logs, connect, entity };
}
