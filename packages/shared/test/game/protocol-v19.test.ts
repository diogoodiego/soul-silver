import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 025, contracts/protocol-v19.md: field moves, riding, fishing, Fly and the development commands.

describe("protocol v19", () => {
  it("is at least version 19", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(19);
  });

  it.each([
    { type: "field-interact", objectId: 4 },
    { type: "field-use", move: "cut", objectId: 4 },
    { type: "field-use", move: "fly" },
    { type: "field-mount", mode: "bike" },
    { type: "field-mount", mode: "surf" },
    { type: "field-dismount" },
    { type: "field-fish", rod: "old" },
    { type: "field-fish", rod: "super" },
    { type: "field-reel" },
    { type: "field-fly", area: "60" },
    { type: "debugGiveBadge", badge: 15 },
    { type: "debugTeachMove", slot: 0, move: 15 },
    { type: "debugGiveItem", item: 78, count: 5 },
  ])("client sends %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    ["a mount mode that is not bike or surf", { type: "field-mount", mode: "run" }],
    ["a rod that does not exist", { type: "field-fish", rod: "great" }],
    ["a badge above 15", { type: "debugGiveBadge", badge: 16 }],
    ["a party slot above 5", { type: "debugTeachMove", slot: 6, move: 15 }],
    ["a zero item count", { type: "debugGiveItem", item: 78, count: 0 }],
    ["a move key that is not a name", { type: "field-use", move: "15" }],
    ["an extra field", { type: "field-reel", now: true }],
  ])("client is refused %s", (_, msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });

  it.each([
    { type: "field-prompt", move: "cut", user: 0, dialog: "0123:4" },
    { type: "field-result", ok: true },
    { type: "field-result", ok: false, reason: "badge" },
    { type: "field-result", ok: false, reason: "notVisited" },
    { type: "field-removed", objectId: 4 },
    { type: "player-mode", mode: "surf" },
    { type: "field-fishing", state: "bite", windowMs: 1200 },
    { type: "field-fishing", state: "escaped" },
    { type: "field-fly-map", points: [{ area: "60", flypoint: 11 }] },
    { type: "field-launchable", launchable: [true, false, true] },
    { type: "field-lit", lit: true },
  ])("server sends %j", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    ["an unknown refusal reason", { type: "field-result", ok: false, reason: "because" }],
    ["a mode the game does not have", { type: "player-mode", mode: "swim" }],
    ["a fishing state that does not exist", { type: "field-fishing", state: "snagged" }],
    ["more than six launchable flags", { type: "field-launchable", launchable: Array(7).fill(true) }],
  ])("server is refused %s", (_, msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(false);
  });
});
