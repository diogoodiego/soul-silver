import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { Direction } from "@soulsilver/shared/maps";
import type { CollisionMap, ServerMessage, StateMessage, WorldLookup } from "@soulsilver/shared/game";
import { createMemoryConnectionPair } from "../src/connection";
import { createSession, type SessionOptions } from "../src/session";
import { newCollection, newProgress, type Save } from "@soulsilver/shared/save";

const VECTORS: Record<Direction, { x: number; y: number }> = { north: { x: 0, y: -1 }, south: { x: 0, y: 1 }, east: { x: 1, y: 0 }, west: { x: -1, y: 0 } };

/** Every area is this one grid, with no neighbors or warps. */
export const flatWorld =
  (grid: CollisionMap): WorldLookup =>
  (id) => ({ id, levels: [grid], warps: [], neighbors: [], widthPx: grid.width * 16, heightPx: grid.height * 16 });

/** A session with in-memory fake clients. */
export function setup(options: Partial<SessionOptions> & { spawn?: (playerId: number) => { area: string; x: number; y: number } } = {}) {
  const { spawn = () => ({ area: "a", x: 24, y: 24 }), ...sessionOptions } = options;
  const logs: string[] = [];
  const session = createSession({
    seed: 1,
    world: () => undefined,
    log: (m) => logs.push(m),
    clock: () => "2026-10-24T12:00:00.000Z",
    newToken: () => `token-${++tokens}`,
    ...sessionOptions,
  });
  let connections = 0;
  let tokens = 0;

  /** Distinct default names: names are unique within a session. */
  function connect(name = `P${++connections}`, protocolVersion = PROTOCOL_VERSION, extra: { save?: Partial<Save>; resumeToken?: string } = {}) {
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    let closed = false;
    client.onMessage((m) => got.push(m as ServerMessage));
    client.onClose(() => {
      closed = true;
    });
    session.connect(server);
    const at = spawn(session.occupied + 1);
    const save: Save = { schemaVersion: 4, pending: [], name, character: "male", ...at, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0, ...newProgress(), ...newCollection(), ...extra.save };
    client.send({ type: "hello", protocolVersion, save, ...(extra.resumeToken ? { resumeToken: extra.resumeToken } : {}) });
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
      saves: () => got.filter((m): m is Extract<ServerMessage, { type: "save" }> => m.type === "save"),
      states: () => got.filter((m): m is StateMessage => m.type === "state"),
      lastState: () => got.filter((m): m is StateMessage => m.type === "state").at(-1),
    };
  }

  const entity = (id: number) => session.world.get(id);

  return { session, logs, connect, entity };
}
