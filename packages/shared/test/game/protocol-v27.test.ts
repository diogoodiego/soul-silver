import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Spec 029, item 029.4: a script waits on the client's hatch animation (EggHatchAnim) for the species hatched.

const hatch = (request: object) => serverMessage.safeParse({ type: "script", id: 1, request });

describe("protocol v27", () => {
  it("is version 27 or later", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(27);
  });

  it("accepts a hatch request for a species", () => {
    expect(hatch({ kind: "hatch", species: 172 }).success).toBe(true);
  });

  it("refuses a hatch request without a species or with extra fields", () => {
    expect(hatch({ kind: "hatch" }).success).toBe(false);
    expect(hatch({ kind: "hatch", species: 172, egg: 1 }).success).toBe(false);
  });
});
