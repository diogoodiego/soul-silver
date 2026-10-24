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

describe("save at hello (spec 012)", () => {
  it("spawns the player where the save says", () => {
    const { connect, entity } = setup();
    const c = connect("Gold", PROTOCOL_VERSION, { save: { area: "town", x: 77, y: 55, facing: "west" } });
    expect(entity(c.welcome!.entityId)).toMatchObject({ area: "town", x: 77, y: 55, facing: "west", data: { name: "Gold" } });
  });

  it("refuses a save that breaks the schema, with the field in the message", () => {
    const { connect } = setup();
    const c = connect("Gold", PROTOCOL_VERSION, { save: { playTimeMs: -5 } });
    expect(c.got[0]).toMatchObject({ type: "reject", code: "invalid-save" });
    expect(JSON.stringify(c.got[0])).toContain("playTimeMs");
    expect(c.closed).toBe(true);
  });

  it("refuses a save from a newer version", () => {
    const { connect } = setup();
    const c = connect("Gold", PROTOCOL_VERSION, { save: { schemaVersion: 99 } });
    expect(c.got).toEqual([expect.objectContaining({ type: "reject", code: "save-too-new" })]);
  });

  it("refuses an impossible save the world check catches (SC-004)", () => {
    const { connect } = setup({ validateSave: (s) => (s.x > 1000 ? "Save incoerente: x fora do mapa" : undefined) });
    const c = connect("Gold", PROTOCOL_VERSION, { save: { x: 5000 } });
    expect(c.got).toEqual([expect.objectContaining({ type: "reject", code: "invalid-save", message: "Save incoerente: x fora do mapa" })]);
  });

  it("refuses a name already in the session, ignoring case and spaces", () => {
    const { connect } = setup();
    connect("Gold");
    const dup = connect("gold ");
    expect(dup.got[0]).toMatchObject({ type: "reject", code: "name-taken" });
    expect(JSON.stringify(dup.got[0])).toContain("em uso");
  });

  it("frees the name when its owner leaves on purpose", () => {
    const { connect } = setup();
    connect("Host");
    const a = connect("Gold");
    a.conn.send({ type: "leave" });
    expect(connect("Gold").welcome).toBeDefined();
  });
});
