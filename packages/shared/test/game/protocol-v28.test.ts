import { describe, expect, it } from "vitest";
import { serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";
import { newBoxes, newCollection, newProgress } from "../../src/save/schema.ts";

// Spec 030, item 030.2: the save the host sends carries ribbons on party members and the photo album (save v15).

const member = { species: 155, level: 5, moves: [33], hp: 20, friendship: 70, experience: 135, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 };
const save = (over: object) => ({ schemaVersion: 15, rivalName: "", storyRev: 1, boxes: newBoxes(), pcItems: [], pending: [], flags: [], vars: {}, npcPlacement: {}, name: "Ana", character: "female", area: "36", x: 1, y: 2, facing: "south", playTimeMs: 0, savedAt: "2026-11-14T12:00:00.000Z", rev: 0, ...newProgress(), ...newCollection(), ...over });

describe("protocol v28", () => {
  it("is version 28", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(28);
  });

  it("carries ribbons and photos in the save", () => {
    const photos = [{ map: 36, spot: 5, species: [155], takenAt: "2026-11-14T12:00:00.000Z" }];
    expect(serverMessage.safeParse({ type: "save", save: save({ party: [{ ...member, ribbons: [63] }], photos }) }).success).toBe(true);
  });

  it("refuses a save without the photo album", () => {
    const { photos: _, ...old } = save({});
    expect(serverMessage.safeParse({ type: "save", save: old }).success).toBe(false);
  });
});
