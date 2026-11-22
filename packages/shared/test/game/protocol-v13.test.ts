import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 020, contracts/protocol-v13.md: what scripts ask of the client, and the script debugger.

describe("protocol v13", () => {
  it("is at least version 13", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(13);
  });

  it.each([
    { kind: "say", text: "0542:3", buffers: { 0: { kind: "player" }, 1: { kind: "species", id: 155 }, 2: { kind: "number", value: 5 } } },
    { kind: "yes-no" },
    { kind: "starter", species: [152, 155, 158] },
    { kind: "wait-fade" },
    { kind: "wait-sound", sound: "fanfare" },
  ])("accepts the request %j", (request) => {
    expect(serverMessage.safeParse({ type: "script", id: 4, request }).success).toBe(true);
  });

  it("never sends a server-side wait to the client", () => {
    expect(serverMessage.safeParse({ type: "script", id: 4, request: { kind: "wait", ticks: 3 } }).success).toBe(false);
  });

  it.each([{ kind: "close-msg" }, { kind: "fade", type: 0, color: 0, duration: 6 }, { kind: "sound", sound: "se", id: 1500 }, { kind: "bgm", id: null }])("accepts the event %j", (event) => {
    expect(serverMessage.safeParse({ type: "script-event", event }).success).toBe(true);
  });

  it("accepts the lock and the debug view", () => {
    expect(serverMessage.safeParse({ type: "script-lock", locked: true }).success).toBe(true);
    const at = { file: 842, entry: 2, pc: 17, command: "NPCMsg", depth: 1 };
    // Spec 024 (v17) adds the debugger's panels.
    const panels = { objects: [], triggers: [], changes: [] };
    expect(serverMessage.safeParse({ type: "script-debug", at, flags: [400], vars: { "16510": 1 }, ...panels }).success).toBe(true);
    expect(serverMessage.safeParse({ type: "script-debug", at: null, flags: [], vars: {}, ...panels }).success).toBe(true);
  });

  it("accepts answers, the debugger switch and flag changes", () => {
    expect(clientMessage.safeParse({ type: "script-answer", id: 4 }).success).toBe(true);
    expect(clientMessage.safeParse({ type: "script-answer", id: 4, answer: 1 }).success).toBe(true);
    expect(clientMessage.safeParse({ type: "debugScript", on: true }).success).toBe(true);
    expect(clientMessage.safeParse({ type: "debugSetFlag", flag: 400, on: false }).success).toBe(true);
  });

  it.each([
    { type: "script-answer", id: -1 },
    { type: "script-answer", id: 1, answer: 33 },
    { type: "debugSetFlag", flag: 0, on: true },
    { type: "debugSetFlag", flag: 70000, on: true },
  ])("rejects %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });

  it("knows NPC entities", () => {
    const npc = { id: 9, kind: "npc", area: "60", x: 8, y: 8, level: 0, facing: "south", data: { sprite: 148, person: 0 } };
    expect(serverMessage.safeParse({ type: "state", tick: 1, lastInput: -1, lastPress: -1, full: true, spawned: [npc], changed: [], removed: [] }).success).toBe(true);
  });
});
