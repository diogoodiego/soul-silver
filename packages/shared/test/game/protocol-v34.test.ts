import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";
import { newBoxes, newCollection, newProgress, SAVE_SCHEMA_VERSION, trainerIdFor } from "../../src/save/schema.ts";

// Item 034.4: the save the protocol carries (save v19) keeps the Hall of Fame.

const save = (over: object) => ({ schemaVersion: 21, trainerId: trainerIdFor("Ana", "2026-11-17T12:00:00.000Z"), rivalName: "", storyRev: 1, boxes: newBoxes(), pcItems: [], pending: [], flags: [], vars: {}, npcPlacement: {}, name: "Ana", character: "female", area: "306", x: 1, y: 2, facing: "north", playTimeMs: 0, savedAt: "2026-11-17T12:00:00.000Z", rev: 0, ...newProgress(), ...newCollection(), ...over });

describe("protocol v34", () => {
  it("is at least version 34, with save v19", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(34);
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThanOrEqual(19);
  });

  it("carries the Hall of Fame in the save, and a save without it", () => {
    const hallOfFame = [{ at: "2026-11-17T12:00:00.000Z", party: [{ species: 157, level: 60 }] }];
    expect(serverMessage.safeParse({ type: "save", save: save({ hallOfFame }) }).success).toBe(true);
    expect(serverMessage.safeParse({ type: "save", save: save({}) }).success).toBe(true);
  });
});
