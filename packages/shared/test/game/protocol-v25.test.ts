import { describe, expect, it } from "vitest";
import { scriptRequest } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 029, item 029.1: the Day Care asks the client which party member to leave (ScrCmd_551).

describe("protocol v25", () => {
  it("is version 25 or later", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(25);
  });

  it("accepts the party request", () => {
    expect(scriptRequest.safeParse({ kind: "party" }).success).toBe(true);
  });

  it("refuses a party request with extra fields", () => {
    expect(scriptRequest.safeParse({ kind: "party", slots: 6 }).success).toBe(false);
  });
});
