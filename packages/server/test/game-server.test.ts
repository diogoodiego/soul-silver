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
