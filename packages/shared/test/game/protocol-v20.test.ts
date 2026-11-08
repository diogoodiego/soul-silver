import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 026, contracts/protocol-v20.md: the session clock, the Pokégear and the clock command.

describe("protocol v20", () => {
  it("is at least version 20", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(20);
  });

  it.each([
    { type: "phoneDial", contact: 10 },
    { type: "phoneAnswer", callId: 3 },
    { type: "phoneAnswer", callId: 3, choice: 1 },
    { type: "radioTune", channel: "pokemonMusic" },
    { type: "radioTune", channel: null },
    { type: "gearOpen" },
    { type: "gearClose" },
    { type: "debugSetClock", clock: { mode: "host" } },
    { type: "debugSetClock", clock: { mode: "fixed", hour: 22 } },
    { type: "debugSetClock", clock: { mode: "fixed", hour: 0, minute: 59, weekday: 6 } },
    { type: "debugSetClock", clock: { mode: "advance", minutes: 600 } },
  ])("client sends %j", (msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    ["a contact above 74", { type: "phoneDial", contact: 75 }],
    ["an hour of 24", { type: "debugSetClock", clock: { mode: "fixed", hour: 24 } }],
    ["a minute of 60", { type: "debugSetClock", clock: { mode: "fixed", hour: 1, minute: 60 } }],
    ["a weekday of 7", { type: "debugSetClock", clock: { mode: "fixed", hour: 1, weekday: 7 } }],
    ["a zero advance", { type: "debugSetClock", clock: { mode: "advance", minutes: 0 } }],
    ["an unknown clock mode", { type: "debugSetClock", clock: { mode: "rewind" } }],
    ["a channel that is not a name", { type: "radioTune", channel: "" }],
  ])("client is refused %s", (_, msg) => {
    expect(clientMessage.safeParse(msg).success).toBe(false);
  });

  it.each([
    { type: "clock", minuteOfDay: 0, weekday: 0, fixed: false },
    { type: "clock", minuteOfDay: 1439, weekday: 6, fixed: true },
    { type: "phone-call", callId: 1, contact: 10, name: "0675:0", direction: "in", lines: ["0675:10"] },
    { type: "phone-call", callId: 1, contact: 1, name: "0716:0", direction: "out", lines: ["0716:33", "0716:34"], choices: ["0675:20", "0675:21"] },
    { type: "phone-state", contacts: [{ id: 10, name: "0675:0", seeking: true }], log: [{ contact: 10, direction: "in", at: "2026-11-02T10:00:00.000Z" }] },
    { type: "radio-state", shows: [{ id: "pokemonTalk", bank: 414 }], tuned: null },
    { type: "radio-state", shows: [], tuned: "pokemonMusic", lines: ["0416:3"] },
    { type: "gear-map", visited: ["60"], others: [{ name: "P2", area: "60", x: 10, y: 20 }] },
  ])("server sends %j", (msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it.each([
    ["a minute of the day of 1440", { type: "clock", minuteOfDay: 1440, weekday: 0, fixed: false }],
    ["a call without lines", { type: "phone-call", callId: 1, contact: 10, name: "0675:0", direction: "in", lines: [] }],
    ["a call direction that is neither in nor out", { type: "phone-call", callId: 1, contact: 10, name: "0675:0", direction: "missed", lines: ["0675:10"] }],
    ["a call without the caller's name", { type: "phone-call", callId: 1, contact: 10, direction: "in", lines: ["0675:10"] }],
  ])("server is refused %s", (_, msg) => {
    expect(serverMessage.safeParse(msg).success).toBe(false);
  });
});
