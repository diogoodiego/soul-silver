import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Block H: the quick swap on the field picks who follows the trainer, without reordering the party.

const party = { type: "party", members: [{ species: 155, level: 5, hp: 20, hpMax: 20 }] };

describe("protocol v37", () => {
  it("is at least version 37", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(37);
  });

  it("lets the client pick a party slot to follow the trainer", () => {
    expect(clientMessage.safeParse({ type: "set-follower", partyIndex: 3 }).success).toBe(true);
    expect(clientMessage.safeParse({ type: "set-follower", partyIndex: 6 }).success).toBe(false);
    expect(clientMessage.safeParse({ type: "set-follower", partyIndex: -1 }).success).toBe(false);
  });

  it("tells the client which member leads on the field, optionally", () => {
    expect(serverMessage.safeParse({ ...party, lead: 0 }).success).toBe(true);
    expect(serverMessage.safeParse(party).success).toBe(true);
    expect(serverMessage.safeParse({ ...party, lead: 6 }).success).toBe(false);
  });
});
