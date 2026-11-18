import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Block H: the Pokédex phone's Save and Trainer Card apps.

const card = { type: "trainer-card", name: "Ana", trainerId: 4321, money: 12_500, badgeSet: 0b1011, playTimeMs: 3_600_000, startedAt: "2026-11-01T08:00:00.000Z", seen: 40, caught: 22, hallOfFame: 0 };

describe("protocol v36", () => {
  it("is at least version 36", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(36);
  });

  it("lets the client ask for a save now and for its trainer card", () => {
    expect(clientMessage.safeParse({ type: "save-now" }).success).toBe(true);
    expect(clientMessage.safeParse({ type: "trainer-card-request" }).success).toBe(true);
  });

  it("carries the trainer card, with or without a start date", () => {
    expect(serverMessage.safeParse(card).success).toBe(true);
    const { startedAt: _, ...undated } = card;
    expect(serverMessage.safeParse(undated).success).toBe(true);
  });

  it.each([
    ["an ID past 65535", { trainerId: 65536 }],
    ["negative money", { money: -1 }],
    ["a start date that is not a date", { startedAt: "ontem" }],
    ["a missing count", { seen: undefined }],
  ])("refuses a card with %s", (_, over) => {
    expect(serverMessage.safeParse({ ...card, ...over }).success).toBe(false);
  });
});
