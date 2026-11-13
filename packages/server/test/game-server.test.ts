import { PROTOCOL_VERSION, type ServerToHostMessage } from "@soulsilver/shared";
import { describe, expect, it, vi } from "vitest";
import { createGameServer } from "../src/game-server";
import { createFakeClock } from "./fake-clock";

function setup() {
  const clock = createFakeClock();
  const sent: ServerToHostMessage[] = [];
  const onFatal = vi.fn();
  const server = createGameServer({
    send: (msg) => sent.push(msg),
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    onFatal,
    log: () => {},
  });
  const init = () => {
    server.handleMessage({ type: "init", protocolVersion: PROTOCOL_VERSION, appVersion: "0.1.0" });
  };
  return { clock, sent, onFatal, server, init };
}

describe("createGameServer", () => {
  it("replies ready and starts ticking after a matching init", () => {
    const { clock, sent, init } = setup();
    init();
    expect(sent).toEqual([{ type: "ready", protocolVersion: PROTOCOL_VERSION }]);
    clock.advance(100);
    expect(sent.slice(1)).toEqual([
      { type: "status", status: { state: "running", tick: 1 } },
      { type: "status", status: { state: "running", tick: 2 } },
    ]);
  });

  it("answers get-info with the same requestId", () => {
    const { clock, sent, server, init } = setup();
    init();
    clock.advance(150);
    sent.length = 0;
    server.handleMessage({ type: "get-info", requestId: 42 });
    expect(sent).toEqual([
      {
        type: "info",
        requestId: 42,
        info: {
          appVersion: "0.1.0",
          protocolVersion: PROTOCOL_VERSION,
          serverStatus: { state: "running", tick: 3 },
          tickRateHz: 20,
          uptimeMs: 150,
          players: 0,
          maxPlayers: 4,
        },
      },
    ]);
  });

  it("rejects an init with another protocol version and fails fatally", () => {
    const { clock, sent, onFatal, server } = setup();
    server.handleMessage({ type: "init", protocolVersion: PROTOCOL_VERSION + 1, appVersion: "9.9.9" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "error", code: "protocol-mismatch" });
    expect(onFatal).toHaveBeenCalledOnce();
    clock.advance(500);
    expect(sent).toHaveLength(1);
  });

  it("discards get-info before init and invalid messages", () => {
    const { sent, server } = setup();
    expect(() => {
      server.handleMessage({ type: "get-info", requestId: 1 });
      server.handleMessage({ type: "nonsense" });
      server.handleMessage(null);
    }).not.toThrow();
    expect(sent).toEqual([]);
  });
});

describe("game channel", () => {
  const hello = {
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    save: { schemaVersion: 1, name: "Ana", character: "female", area: "60", x: 10, y: 10, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0 },
  };
  const toClient = (sent: ServerToHostMessage[], connId: number) =>
    sent.flatMap((m) => (m.type === "client-send" && m.connId === connId ? [m.msg as { type: string }] : []));

  it("opens a session connection for a new connId and streams state each tick", () => {
    const { clock, sent, server, init } = setup();
    init();
    server.handleMessage({ type: "client-message", connId: 1, msg: hello });
    expect(toClient(sent, 1)[0]).toMatchObject({ type: "welcome", playerId: 1 });
    clock.advance(100);
    expect(toClient(sent, 1).filter((m) => m.type === "state")).toHaveLength(2);
  });

  it("sends tick metrics to clients once per second", () => {
    const { clock, sent, server, init } = setup();
    init();
    server.handleMessage({ type: "client-message", connId: 1, msg: hello });
    clock.advance(1000);
    const debug = toClient(sent, 1).filter((m) => m.type === "debug");
    expect(debug).toEqual([{ type: "debug", metrics: expect.objectContaining({ overruns: 0 }) as unknown }]);
  });

  it("tells the host to drop a connection the session closes", () => {
    const { sent, server, init } = setup();
    init();
    server.handleMessage({ type: "client-message", connId: 3, msg: { ...hello, protocolVersion: 0 } });
    expect(sent.at(-1)).toEqual({ type: "client-close", connId: 3 });
  });

  it("starts a new session after the previous one closed", () => {
    const { sent, server, init } = setup();
    init();
    server.handleMessage({ type: "client-message", connId: 1, msg: hello });
    server.handleMessage({ type: "client-close", connId: 1 });
    server.handleMessage({ type: "client-message", connId: 2, msg: hello });
    expect(toClient(sent, 2)[0]).toMatchObject({ type: "welcome" });
  });

  it("ignores client messages before init", () => {
    const { sent, server } = setup();
    server.handleMessage({ type: "client-message", connId: 1, msg: hello });
    expect(sent).toEqual([]);
  });
});
