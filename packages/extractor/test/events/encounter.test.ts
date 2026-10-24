import { parseEventsFile } from "@soulsilver/shared/events";
import { describe, expect, it } from "vitest";
import { readEncounter, readHeadbutt } from "../../src/events/encounter.ts";
import { buildEncounter, buildHeadbutt } from "../fixtures/events/builders.ts";

const twelve = (value: number) => Array.from({ length: 12 }, () => value);
const land = (species: number) => Array.from({ length: 12 }, (_, i) => species + i);

describe("readEncounter", () => {
  it("separates grass by time of day, with the levels shared and the chances in slot order", () => {
    const record = readEncounter(
      buildEncounter({
        rates: [10, 0, 0, 0, 0, 0],
        levels: [2, 2, 3, 3, 3, 3, 4, 4, 5, 5, 6, 6],
        morning: land(10),
        day: land(30),
        night: land(50),
      }),
      7,
    );
    expect(record.id).toBe(7);
    expect(record.rates.walking).toBe(10);
    expect(record.grass!.morning.map((s) => s.species)).toEqual(land(10));
    expect(record.grass!.day[0]).toEqual({ species: 30, form: 0, minLevel: 2, maxLevel: 2, chance: 20 });
    expect(record.grass!.night.map((s) => s.chance)).toEqual([20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1]);
    expect(record.grass!.night[11]).toMatchObject({ species: 61, minLevel: 6, maxLevel: 6 });
  });

  it("reads surf, rock smash and each rod with their own level ranges and chances", () => {
    const slots = (base: number, n: number) => Array.from({ length: n }, (_, i) => ({ species: base + i, minLevel: 10 + i, maxLevel: 12 + i }));
    const record = readEncounter(
      buildEncounter({ rates: [0, 4, 5, 6, 7, 8], surf: slots(100, 5), rockSmash: slots(200, 2), oldRod: slots(300, 5), goodRod: slots(400, 5), superRod: slots(500, 5) }),
      0,
    );
    expect(record.rates).toEqual({ walking: 0, surfing: 4, rockSmash: 5, oldRod: 6, goodRod: 7, superRod: 8 });
    expect(record.surf!.map((s) => s.chance)).toEqual([60, 30, 5, 4, 1]);
    expect(record.surf![2]).toEqual({ species: 102, form: 0, minLevel: 12, maxLevel: 14, chance: 5 });
    expect(record.rockSmash!.map((s) => s.chance)).toEqual([80, 20]);
    expect(record.oldRod!.map((s) => s.chance)).toEqual([40, 30, 15, 10, 5]);
    expect(record.goodRod![0]!.species).toBe(400);
    expect(record.superRod![4]!.species).toBe(504);
  });

  it("leaves out every kind that has no Pokémon instead of inventing an empty table", () => {
    const record = readEncounter(buildEncounter({ rates: [5, 0, 0, 0, 0, 0], morning: land(1), day: land(1), night: land(1), levels: twelve(3) }), 1);
    expect(Object.keys(record).sort()).toEqual(["grass", "id", "rates"]);
  });

  it("reads the radio sounds, the swarm species and the night fishing species when present", () => {
    const record = readEncounter(buildEncounter({ sounds: [[1, 2], [3, 4]], swarm: [5, 6, 7, 8] }), 2); // stored as land, surf, night fishing, fishing
    expect(record.sounds).toEqual({ hoenn: [1, 2], sinnoh: [3, 4] });
    expect(record.swarm).toEqual({ grass: 5, surf: 6, fish: 8 });
    expect(record.nightFish).toBe(7);
  });

  it("splits the form out of the species", () => {
    const record = readEncounter(buildEncounter({ morning: [201 | (3 << 10)], levels: [5], day: [201], night: [201] }), 3);
    expect(record.grass!.morning[0]).toMatchObject({ species: 201, form: 3 });
  });

  it("produces a record the shared schema accepts", () => {
    const record = readEncounter(buildEncounter({ rates: [10, 0, 0, 0, 0, 0], morning: land(1), day: land(1), night: land(1), levels: twelve(3) }), 0);
    expect(parseEventsFile("encounters", { kind: "encounters", formatVersion: 1, records: [record] }, "e.json").ok).toBe(true);
  });

  it("fails with the member and the size when a record is not 196 bytes", () => {
    expect(() => readEncounter(new Uint8Array(100), 9)).toThrow(/encounter 9.*100 bytes.*196/);
  });
});

describe("readHeadbutt", () => {
  it("reads the three tables and the trees in groups, without the padding", () => {
    const record = readHeadbutt(
      buildHeadbutt({
        common: [{ species: 163, minLevel: 2, maxLevel: 3 }],
        rare: [{ species: 204, minLevel: 4, maxLevel: 5 }],
        secret: [{ species: 265, minLevel: 6, maxLevel: 7 }],
        regular: [[[4, 5], [6, 7]]],
        secretTrees: [[[8, 9]]],
      }),
      12,
    )!;
    expect(record.id).toBe(12);
    expect(record.common[0]).toEqual({ species: 163, form: 0, minLevel: 2, maxLevel: 3, chance: 50 });
    expect(record.common).toHaveLength(6);
    expect(record.rare[0]!.species).toBe(204);
    expect(record.secret[0]!.species).toBe(265);
    expect(record.regularTrees).toEqual([[[4, 5], [6, 7]]]);
    expect(record.secretTrees).toEqual([[[8, 9]]]);
  });

  it("gives an empty table when none of its slots has a Pokémon", () => {
    expect(readHeadbutt(buildHeadbutt({ regular: [[[1, 1]]] }), 0)!.common).toEqual([]);
  });

  it("returns null for a map without trees", () => {
    expect(readHeadbutt(buildHeadbutt({}), 1)).toBeNull();
  });

  it("fails with the member and the size when the length does not match the tree counts", () => {
    const bytes = buildHeadbutt({ regular: [[[1, 1]]] });
    expect(() => readHeadbutt(bytes.subarray(0, bytes.length - 4), 3)).toThrow(/headbutt 3.*bytes/);
  });
});
