import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";
import { newBoxes, newCollection, newProgress, SAVE_SCHEMA_VERSION } from "../../src/save/schema.ts";

// Item 031.7: the save the protocol carries (save v18) keeps the Seal Case.

const save = (over: object) => ({ schemaVersion: 18, rivalName: "", storyRev: 1, boxes: newBoxes(), pcItems: [], pending: [], flags: [], vars: {}, npcPlacement: {}, name: "Ana", character: "female", area: "215", x: 1, y: 2, facing: "south", playTimeMs: 0, savedAt: "2026-11-16T12:00:00.000Z", rev: 0, ...newProgress(), ...newCollection(), ...over });

describe("protocol v32", () => {
  it("is version 32, with save v18", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(32);
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(18);
  });

  it("carries the seals in the save, and a save without them", () => {
    expect(serverMessage.safeParse({ type: "save", save: save({ seals: { "29": 3 } }) }).success).toBe(true);
    expect(serverMessage.safeParse({ type: "save", save: save({}) }).success).toBe(true);
  });
});
