import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";
import { newBoxes, newCollection, newProgress, SAVE_SCHEMA_VERSION } from "../../src/save/schema.ts";

// Item 031.2: the save the protocol carries (save v17) keeps the player's roaming Raikou and Entei.

const save = (over: object) => ({ schemaVersion: 18, trainerId: 0, rivalName: "", storyRev: 1, boxes: newBoxes(), pcItems: [], pending: [], flags: [], vars: {}, npcPlacement: {}, name: "Ana", character: "female", area: "41", x: 1, y: 2, facing: "south", playTimeMs: 0, savedAt: "2026-11-15T12:00:00.000Z", rev: 0, ...newProgress(), ...newCollection(), ...over });

describe("protocol v31", () => {
  it("is version 31, with save v17", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(31);
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(17);
  });

  it("carries the roamers in the save, and a save without them", () => {
    expect(serverMessage.safeParse({ type: "save", save: save({ roamers: [{ id: 0, area: "33", hp: 90, status: "paralysis" }, { id: 1, area: "48" }] }) }).success).toBe(true);
    expect(serverMessage.safeParse({ type: "save", save: save({}) }).success).toBe(true);
  });
});
