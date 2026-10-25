import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";

const entity = { id: 1, kind: "player", area: "a", x: 1.5, y: 2, level: 0, facing: "north", data: { name: "Ana" } };
const still = { x: 0, y: 0 };
const save = { schemaVersion: 1, name: "Ana", character: "female", area: "60", x: 1, y: 2, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0 };

describe("clientMessage", () => {
  it.each([
    { type: "hello", protocolVersion: 4, save },
    { type: "hello", protocolVersion: 4, save: { anything: true }, resumeToken: "abc" },
    { type: "save-ack", rev: 3 },
    { type: "input", seq: 0, move: { x: 1, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 5, move: { x: -0.71, y: 0.71 }, run: true, buttons: 3 },
    { type: "input", seq: 6, move: { x: 1, y: 1 }, run: false, buttons: 0 },
    { type: "input", seq: 7, move: still, run: false, buttons: 1, aim: { x: 0.6, y: -0.8 } },
    { type: "hello", protocolVersion: 5, save, arena: { a: { species: 155, level: 10, moves: [52] }, b: { species: 152, level: 10, moves: [33, 45] } } },
    { type: "leave" },
  ])("accepts %o", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    null,
    "hello",
    [],
    { type: "nope" },
    { type: "hello", protocolVersion: 4, name: "Ana" },
    { type: "hello", protocolVersion: 4, save, resumeToken: "" },
    { type: "hello", protocolVersion: -1, save },
    { type: "save-ack", rev: -1 },
    { type: "input", seq: -1, move: still, run: false, buttons: 0 },
    { type: "input", seq: 1.5, move: still, run: false, buttons: 0 },
    { type: "input", seq: 1, dir: "east", buttons: 0 },
    { type: "input", seq: 1, move: { x: 1.5, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 1, move: { x: 0, y: -2 }, run: false, buttons: 0 },
    { type: "input", seq: 1, move: { x: Number.NaN, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 1, move: { x: Infinity, y: 0 }, run: false, buttons: 0 },
    { type: "input", seq: 1, move: still, buttons: 0 },
    { type: "input", seq: 1, move: still, run: false, buttons: 0, extra: true },
    { type: "input", seq: 1, move: still, run: false, buttons: 1, aim: { x: 2, y: 0 } },
    { type: "hello", protocolVersion: 5, save, arena: { a: { species: 155, level: 101, moves: [52] }, b: { species: 152, level: 10, moves: [33] } } },
    { type: "hello", protocolVersion: 5, save, arena: { a: { species: 155, level: 10, moves: [] }, b: { species: 152, level: 10, moves: [33] } } },
    { type: "hello", protocolVersion: 5, save, arena: { a: { species: 155, level: 10, moves: [1, 2, 3, 4, 5] }, b: { species: 152, level: 10, moves: [33] } } },
  ])("rejects %o", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });
});

describe("serverMessage", () => {
  it.each([
    { type: "welcome", protocolVersion: 4, playerId: 1, entityId: 1, tick: 0, tickRateHz: 20, resumeToken: "t", resumed: false },
    { type: "reject", code: "invalid-save", message: "x", serverProtocolVersion: 4 },
    { type: "reject", code: "save-too-new", message: "x", serverProtocolVersion: 4 },
    { type: "reject", code: "name-taken", message: "x", serverProtocolVersion: 4 },
    { type: "save", save },
    { type: "reject", code: "protocol-mismatch", message: "x", serverProtocolVersion: 2 },
    { type: "state", tick: 3, lastInput: -1, full: true, spawned: [entity], changed: [{ id: 1, x: 3, level: 1 }], removed: [2] },
    { type: "debug", metrics: { lastMs: 1, avgMs: 1, maxMs: 2, overruns: 0 } },
    { type: "session-closed", reason: "host-left" },
    { type: "combat-event", tick: 4, events: [{ kind: "hit", attacker: 1, target: 2, move: 52, amount: 12, effectiveness: 2, crit: false, push: { x: 3, y: 0 } }, { kind: "tick", attacker: 2, target: 2, move: 0, amount: 1, effectiveness: 1, crit: false, push: { x: 0, y: 0 }, status: "burn" }] },
    { type: "reject", code: "invalid-message", message: "x", serverProtocolVersion: 5 },
  ])("accepts %o", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    { type: "welcome", protocolVersion: 4, playerId: 1, entityId: 1, tick: 0, tickRateHz: 20 },
    { type: "save", save: { ...save, name: "" } },
    { type: "welcome", protocolVersion: 4, playerId: 1, entityId: 1, tick: 0, tickRateHz: 30, resumeToken: "t", resumed: false },
    { type: "reject", code: "other", message: "x", serverProtocolVersion: 2 },
    { type: "state", tick: 3, lastInput: -2, full: true, spawned: [], changed: [], removed: [] },
    { type: "state", tick: 3, lastInput: 0, full: true, spawned: [{ ...entity, kind: "dragon" }], changed: [], removed: [] },
    { type: "state", tick: 3, lastInput: 0, full: true, spawned: [{ ...entity, level: -1 }], changed: [], removed: [] },
    { type: "state", tick: 3, lastInput: 0, full: true, spawned: [{ ...entity, level: 0.5 }], changed: [], removed: [] },
    { type: "session-closed", reason: "bored" },
    { type: "combat-event", tick: 4, events: [{ kind: "boom", attacker: 1, target: 2, move: 52, amount: 12, effectiveness: 2, crit: false, push: { x: 3, y: 0 } }] },
    { type: "combat-event", tick: 4, events: [{ kind: "hit", attacker: 1, target: 2, move: 52, amount: -1, effectiveness: 2, crit: false, push: { x: 3, y: 0 } }] },
  ])("rejects %o", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(false);
  });
});
