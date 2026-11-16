import { describe, expect, it } from "vitest";
import { migrate } from "../../src/save/migrate.ts";
import { BOX_COUNT, BOX_SLOTS } from "../../src/save/schema.ts";

// Spec 023: the temporary storage becomes the PC (boxes) and the PC item storage joins the save.

const stats = (v: number) => ({ hp: v, attack: v, defense: v, speed: v, specialAttack: v, specialDefense: v });
const mon = (species: number) => ({ species, level: 5, moves: [33], hp: 10, friendship: 70, experience: 125, ivs: stats(31), evs: stats(0), nature: 0 });

const v6 = {
  schemaVersion: 6,
  name: "Gold",
  character: "male",
  area: "60",
  x: 1,
  y: 2,
  facing: "south",
  playTimeMs: 0,
  savedAt: "2026-10-24T12:00:00.000Z",
  rev: 0,
  party: [],
  money: 3000,
  badges: 0,
  respawn: null,
  bag: [],
  pokedex: { seen: [], caught: [] },
  storage: [] as ReturnType<typeof mon>[],
  pending: [],
  flags: [],
  vars: {},
  npcPlacement: {},
};

describe("save v7", () => {
  it.each([0, 1, 30])("moves %i stored Pokémon to box 1, in order, without losing any", (n) => {
    const storage = Array.from({ length: n }, (_, i) => mon(i + 1));
    const result = migrate({ ...v6, storage });
    if (!result.ok) throw new Error(result.message);
    const { save } = result;
    expect(save).not.toHaveProperty("storage");
    expect(save.schemaVersion).toBe(16);
    expect(save.pcItems).toEqual([]);
    expect(save.boxes).toHaveLength(BOX_COUNT);
    expect(save.boxes.map((b) => b.name)).toEqual(Array.from({ length: BOX_COUNT }, (_, i) => `BOX ${i + 1}`));
    for (const box of save.boxes) expect(box.slots).toHaveLength(BOX_SLOTS);
    expect(save.boxes[0]!.slots.slice(0, n)).toEqual(storage);
    expect(save.boxes.flatMap((b) => b.slots).filter(Boolean)).toHaveLength(n);
  });

  /** The fields of a v7 save the cases below break. */
  type Spoilable = { boxes: { name: string; slots: unknown[] }[]; pcItems: unknown };
  it.each([
    ["a box name longer than 8", (s: Spoilable) => (s.boxes[0]!.name = "123456789")],
    ["a box with the wrong slot count", (s: Spoilable) => s.boxes[0]!.slots.pop()],
    ["a missing box", (s: Spoilable) => s.boxes.pop()],
    ["a repeated PC item", (s: Spoilable) => (s.pcItems = [{ item: 4, count: 1 }, { item: 4, count: 2 }])],
    ["more than 50 PC items", (s: Spoilable) => (s.pcItems = Array.from({ length: 51 }, (_, i) => ({ item: i + 1, count: 1 })))],
  ])("refuses %s", (_, spoil) => {
    const result = migrate({ ...v6 });
    if (!result.ok) throw new Error(result.message);
    const v7 = structuredClone(result.save) as Spoilable;
    spoil(v7);
    expect(migrate(v7).ok).toBe(false);
  });
});
