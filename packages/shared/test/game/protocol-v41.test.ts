import { describe, expect, it } from "vitest";
import { clientMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// The host picks the time of day the game runs from; null goes back to the PC's clock.

describe("protocol v41", () => {
  it("is at least version 41", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(41);
  });

  it("takes a minute of the day or null", () => {
    for (const minuteOfDay of [0, 1439, null]) expect(clientMessage.safeParse({ type: "setClock", minuteOfDay }).success).toBe(true);
    for (const minuteOfDay of [-1, 1440, 1.5]) expect(clientMessage.safeParse({ type: "setClock", minuteOfDay }).success).toBe(false);
  });
});
