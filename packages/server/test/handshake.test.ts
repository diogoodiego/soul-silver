import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { protocolMismatchMessage } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { createMemoryConnectionPair } from "../src/connection";
import { setup } from "./harness";

describe("handshake", () => {
  it("rejects another protocol version with both versions in the message", () => {
    const { connect } = setup();
    const old = connect("Old", PROTOCOL_VERSION - 1);
    expect(old.got).toEqual([
      {
        type: "reject",
        code: "protocol-mismatch",
        message: protocolMismatchMessage(PROTOCOL_VERSION, PROTOCOL_VERSION - 1),
        serverProtocolVersion: PROTOCOL_VERSION,
      },
    ]);
    expect(old.closed).toBe(true);
  });

  it("welcomes the matching version", () => {
    const { connect } = setup();
    expect(connect().welcome).toMatchObject({ protocolVersion: PROTOCOL_VERSION, tickRateHz: 20 });
  });

  it("discards and logs messages before hello", () => {
    const { session, logs } = setup();
    const [server, client] = createMemoryConnectionPair();
    const got: unknown[] = [];
    client.onMessage((m) => got.push(m));
    session.connect(server);
    client.send({ type: "input", seq: 0, move: { x: 1, y: 0 }, run: false, buttons: 0 });
    session.step();
    expect(got).toEqual([]);
    expect(logs.some((l) => l.includes("before hello"))).toBe(true);
  });
});
