import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// Block H: the options around the person in front (talk, shop, heal, battle) and the nurse's heal done at once.

describe("protocol v40", () => {
  it("is at least version 40", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(40);
  });

  it("takes an action on a person and refuses unknown ones", () => {
    for (const action of ["talk", "shop", "sell", "heal", "battle"]) expect(clientMessage.safeParse({ type: "npc-action", npcId: 7, action }).success).toBe(true);
    expect(clientMessage.safeParse({ type: "npc-action", npcId: 7, action: "fly" }).success).toBe(false);
    expect(clientMessage.safeParse({ type: "npc-action", npcId: -1, action: "talk" }).success).toBe(false);
  });

  it("says the party was healed", () => {
    expect(serverMessage.safeParse({ type: "healed" }).success).toBe(true);
  });
});
