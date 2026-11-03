import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PLAYER_NAME_MAX } from "../../src/game/limits.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 024, contracts/protocol-v17.md: the rival's name, the debugger's panels and the dev warp.

const debug = {
  type: "script-debug",
  at: null,
  flags: [418],
  vars: { "16646": 1 },
  objects: [{ id: 4, sprite: 1032, hideFlag: 418, visible: false }, { id: 2, sprite: 7, hideFlag: null, visible: true }],
  triggers: [{ kind: "mapScript", script: "0150:2", condition: "var 0x4106 = 0", met: true }, { kind: "trigger", script: "0150:3", condition: "var 0x4072 = 1", met: false }],
  changes: [{ tick: 40, kind: "flag", id: 418, value: 1, script: "0149:0" }, { tick: 41, kind: "var", id: 0x4106, value: 1, script: "dev" }],
};

describe("protocol v17", () => {
  it("carries Estou preso both ways", () => {
    expect(clientMessage.safeParse({ type: "rescue" }).success).toBe(true);
    expect(serverMessage.safeParse({ type: "rescued" }).success).toBe(true);
  });

  it("is at least version 17", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(17);
  });

  it.each([
    { type: "script", id: 1, request: { kind: "name", purpose: "rival" } },
    { type: "script", id: 2, request: { kind: "say", text: "0040:3", buffers: { "0": { kind: "rival", name: "Silver" } } } },
    debug,
    // Prof. Oak's intro is a script of its own, with no file (file -1).
    { ...debug, at: { file: -1, entry: 0, pc: 0, command: "NPCMsg", depth: 1 } },
  ])("server accepts %j", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    { type: "script-answer", id: 1, text: "Silver" },
    { type: "debugWarp", map: 64, tx: 6, ty: 6 },
    { type: "debugSetHp", hp: 1 },
  ])("client accepts %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    { type: "script-answer", id: 1, text: "x".repeat(PLAYER_NAME_MAX + 1) },
    { type: "debugWarp", map: -1, tx: 0, ty: 0 },
    { type: "debugSetHp", hp: 0 },
  ])("client rejects %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });

  it.each([
    { ...debug, triggers: [{ ...debug.triggers[0], kind: "sign" }] },
    { ...debug, changes: [{ ...debug.changes[0], kind: "item" }] },
    { ...debug, changes: Array.from({ length: 65 }, () => debug.changes[0]) },
  ])("server rejects a bad debugger panel %#", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(false);
  });
});
