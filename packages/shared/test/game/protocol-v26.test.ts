import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 029, item 029.2: the party tells the client which members are eggs.

const member = { species: 10, level: 1, hp: 11, hpMax: 11 };

describe("protocol v26", () => {
  it("is version 26 or later", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(26);
  });

  it("accepts an egg in the party", () => {
    expect(serverMessage.safeParse({ type: "party", members: [member, { ...member, egg: true }] }).success).toBe(true);
  });

  it("refuses an egg flag that is not true", () => {
    expect(serverMessage.safeParse({ type: "party", members: [{ ...member, egg: false }] }).success).toBe(false);
  });
});
