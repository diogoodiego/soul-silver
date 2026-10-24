import { parseEventsFile } from "@soulsilver/shared/events";
import { describe, expect, it } from "vitest";
import { readTrainer } from "../../src/events/trainer.ts";
import { buildTrainerData, buildTrainerTeam } from "../fixtures/events/builders.ts";

const read = (type: number, team: Parameters<typeof buildTrainerTeam>[1], extra: Partial<Parameters<typeof buildTrainerData>[0]> = {}, id = 5) =>
  readTrainer(buildTrainerData({ type, class: 11, count: team.length, ...extra }), buildTrainerTeam(type, team), id);

describe("readTrainer", () => {
  it("reads class, name and a team of species and levels", () => {
    const trainer = read(0, [{ level: 5, species: 16 }, { level: 7, species: 19, difficulty: 30 }])!;
    expect(trainer.id).toBe(5);
    expect(trainer.class).toEqual({ id: 11, text: "0730:11" });
    expect(trainer.name).toBe("0729:5");
    expect(trainer.team).toEqual([
      { difficulty: 0, genderOverride: 0, abilityOverride: 0, level: 5, species: 16, form: 0, item: null, moves: null, capsule: 0 },
      { difficulty: 30, genderOverride: 0, abilityOverride: 0, level: 7, species: 19, form: 0, item: null, moves: null, capsule: 0 },
    ]);
  });

  it("reads custom moves (type 1), a held item (type 2) or both (type 3)", () => {
    const moves = read(1, [{ level: 10, species: 1, moves: [33, 45, 0, 0] }])!;
    expect(moves.team[0]).toMatchObject({ moves: [33, 45, 0, 0], item: null });
    const item = read(2, [{ level: 10, species: 1, item: 17, capsule: 3 }])!;
    expect(item.team[0]).toMatchObject({ item: 17, moves: null, capsule: 3 });
    const both = read(3, [{ level: 10, species: 1, item: 17, moves: [1, 2, 3, 4], capsule: 3 }, { level: 11, species: 2, item: 0, moves: [5, 6, 7, 8] }])!;
    expect(both.team[0]).toMatchObject({ item: 17, moves: [1, 2, 3, 4], capsule: 3 });
    expect(both.team[1]).toMatchObject({ item: null, moves: [5, 6, 7, 8] });
  });

  it("splits the form out of the species and the gender and ability overrides out of one byte", () => {
    const trainer = read(0, [{ level: 20, species: 386, form: 2, gender: 0x21 }])!;
    expect(trainer.team[0]).toMatchObject({ species: 386, form: 2, genderOverride: 1, abilityOverride: 2 });
  });

  it("reads the battle items, the AI flags and the double battle flag", () => {
    const trainer = read(0, [{ level: 5, species: 1 }], { items: [17, 0, 18, 0], aiFlags: 0x80000007, double: 1 })!;
    expect(trainer.items).toEqual([17, 18]);
    expect(trainer.aiFlags).toBe(0x80000007);
    expect(trainer.doubleBattle).toBe(true);
  });

  it("accepts the padding that rounds a team up to a multiple of four bytes", () => {
    const team = buildTrainerTeam(3, [{ level: 5, species: 1 }, { level: 5, species: 1 }, { level: 5, species: 1 }]); // 54 bytes
    expect(team.length).toBe(54);
    const padded = new Uint8Array(56);
    padded.set(team);
    expect(readTrainer(buildTrainerData({ type: 3, class: 1, count: 3 }), padded, 1)!.team).toHaveLength(3);
  });

  it("returns null for the empty placeholder trainer", () => {
    expect(readTrainer(buildTrainerData({ type: 0, class: 0, count: 0 }), new Uint8Array(8), 0)).toBeNull();
  });

  it("produces a record the shared schema accepts", () => {
    const trainer = read(3, [{ level: 5, species: 16, item: 4, moves: [1, 2, 3, 4] }])!;
    expect(parseEventsFile("trainers", { kind: "trainers", formatVersion: 1, records: [trainer] }, "t.json").ok).toBe(true);
  });

  it.each([
    ["data of the wrong size", new Uint8Array(10), new Uint8Array(8), /trainer 5.*10 bytes.*20/],
    ["an unknown trainer type", buildTrainerData({ type: 4, class: 1, count: 1 }), new Uint8Array(8), /trainer 5.*type 4/],
    ["a team that does not match the Pokémon count", buildTrainerData({ type: 0, class: 1, count: 3 }), new Uint8Array(8), /trainer 5.*team has 8 bytes.*24/],
  ])("fails with the trainer id for %s", (_name, data, team, message) => {
    expect(() => readTrainer(data, team, 5)).toThrow(message);
  });
});
