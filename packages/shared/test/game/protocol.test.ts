import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";

const entity = { id: 1, kind: "player", area: "a", x: 1.5, y: 2, level: 0, facing: "north", data: { name: "Ana" } };
const still = { x: 0, y: 0 };

describe("clientMessage", () => {
  it.each([
    { type: "hello", protocolVersion: 2, name: "Ana" },
    { type: "input", seq: 0, move: { x: 1, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 5, move: { x: -0.71, y: 0.71 }, run: true, buttons: 3 },
    { type: "input", seq: 6, move: { x: 1, y: 1 }, run: false, buttons: 0 },
    { type: "leave" },
  ])("accepts %o", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    null,
    "hello",
    [],
    { type: "nope" },
    { type: "hello", protocolVersion: 2 },
    { type: "hello", protocolVersion: 2, name: "" },
    { type: "hello", protocolVersion: 2, name: "x".repeat(17) },
    { type: "hello", protocolVersion: -1, name: "Ana" },
    { type: "input", seq: -1, move: still, run: false, buttons: 0 },
    { type: "input", seq: 1.5, move: still, run: false, buttons: 0 },
    { type: "input", seq: 1, dir: "east", buttons: 0 },
    { type: "input", seq: 1, move: { x: 1.5, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 1, move: { x: 0, y: -2 }, run: false, buttons: 0 },
    { type: "input", seq: 1, move: { x: Number.NaN, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 1, move: { x: Infinity, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 1, move: still, buttons: 0 },
    { type: "input", seq: 1, move: still, run: false, buttons: 0, extra: true },
  ])("rejects %o", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });
});

describe("serverMessage", () => {
  it.each([
    { type: "welcome", protocolVersion: 2, playerId: 1, entityId: 1, tick: 0, tickRateHz: 20 },
    { type: "reject", code: "protocol-mismatch", message: "x", serverProtocolVersion: 2 },
    { type: "state", tick: 3, lastInput: -1, full: true, spawned: [entity], changed: [{ id: 1, x: 3, level: 1 }], removed: [2] },
    { type: "debug", metrics: { lastMs: 1, avgMs: 1, maxMs: 2, overruns: 0 } },
    { type: "session-closed", reason: "host-left" },
  ])("accepts %o", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    { type: "welcome", protocolVersion: 2, playerId: 1, entityId: 1, tick: 0, tickRateHz: 30 },
    { type: "reject", code: "other", message: "x", serverProtocolVersion: 2 },
    { type: "state", tick: 3, lastInput: -2, full: true, spawned: [], changed: [], removed: [] },
    { type: "state", tick: 3, lastInput: 0, full: true, spawned: [{ ...entity, kind: "dragon" }], changed: [], removed: [] },
    { type: "state", tick: 3, lastInput: 0, full: true, spawned: [{ ...entity, level: -1 }], changed: [], removed: [] },
    { type: "state", tick: 3, lastInput: 0, full: true, spawned: [{ ...entity, level: 0.5 }], changed: [], removed: [] },
    { type: "session-closed", reason: "bored" },
  ])("rejects %o", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(false);
  });
});
