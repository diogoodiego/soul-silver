import { describe, expect, it } from "vitest";
import { readAbilityCount, readGrowthRates, readNatures, readTypeChart, types } from "../../src/data/readers/tables.ts";
import { growth, msgBankHeader, natures, standardNatureRows, SYNTHETIC_EXPERIENCE, typeChart } from "../fixtures/game-data/builders.ts";

/** Places `bytes` at `offset` inside a zero-filled buffer. */
function at(offset: number, bytes: Uint8Array, size = offset + bytes.length + 16): Uint8Array {
  const buffer = new Uint8Array(size);
  buffer.set(bytes, offset);
  return buffer;
}

describe("readTypeChart", () => {
  const triples: Array<[number, number, number]> = [
    [10, 10, 5],
    [10, 12, 20],
    [0, 8, 5],
    [0, 7, 0],
    [1, 7, 0],
  ];

  it("builds an 18×18 matrix in tenths, defaulting to 10", () => {
    const { records } = readTypeChart(at(0x20, typeChart(triples, [[0, 7], [1, 7]])), 0x20);
    expect(records).toHaveLength(18);
    expect(records.map((r) => r.id)).toEqual(Array.from({ length: 18 }, (_, i) => i));
    expect(records.every((r) => r.against.length === 18)).toBe(true);
    expect(records[10]!.against[10]).toBe(5);
    expect(records[10]!.against[12]).toBe(20);
    expect(records[0]!.against[8]).toBe(5);
    expect(records[3]!.against[3]).toBe(10);
  });

  it("includes the pairs after the separator in the matrix and lists them as Foresight-ignored", () => {
    const { records, foresightIgnored } = readTypeChart(at(0, typeChart(triples, [[0, 7], [1, 7]])), 0);
    expect(records[0]!.against[7]).toBe(0);
    expect(records[1]!.against[7]).toBe(0);
    expect(foresightIgnored).toEqual([
      { attacker: 0, defender: 7 },
      { attacker: 1, defender: 7 },
    ]);
  });

  it("has an empty Foresight list when nothing follows the separator", () => {
    expect(readTypeChart(at(0, typeChart(triples)), 0).foresightIgnored).toEqual([]);
  });

  it("throws naming the table and offset for a multiplier the game never uses", () => {
    const bytes = at(5, typeChart([[10, 10, 7]]));
    expect(() => readTypeChart(bytes, 5)).toThrow(/tabela de tipos/i);
    expect(() => readTypeChart(bytes, 5)).toThrow(/0x5/);
  });

  it("throws for a type id of 18 or more", () => {
    expect(() => readTypeChart(at(0, typeChart([[18, 0, 5]])), 0)).toThrow(/tabela de tipos/i);
    expect(() => readTypeChart(at(0, typeChart([[0, 40, 5]])), 0)).toThrow(/tabela de tipos/i);
  });

  it("throws when no terminator shows up within 200 triples", () => {
    expect(() => readTypeChart(new Uint8Array(2000), 0)).toThrow(/tabela de tipos/i);
  });
});

describe("readNatures", () => {
  it("maps the column order attack, defense, speed, special attack, special defense", () => {
    const records = readNatures(at(0x10, natures(standardNatureRows())), 0x10);
    expect(records).toHaveLength(25);
    expect(records[1]).toEqual({ id: 1, name: { catalog: "nature-names", index: 1 }, increased: "attack", decreased: "defense" });
    expect(records[3]).toMatchObject({ increased: "attack", decreased: "specialAttack" });
    expect(records[7]).toMatchObject({ increased: "defense", decreased: "speed" });
    expect(records[24]).toMatchObject({ increased: null, decreased: null });
  });

  it("makes rows 0, 6, 12, 18 and 24 neutral", () => {
    const records = readNatures(at(0, natures(standardNatureRows())), 0);
    for (const index of [0, 6, 12, 18, 24]) expect(records[index]).toMatchObject({ increased: null, decreased: null });
    expect(records.filter((n) => n.increased !== null)).toHaveLength(20);
  });

  it("throws, naming the offset, when a neutral row is not zeroed", () => {
    const rows = standardNatureRows();
    rows[6] = [1, -1, 0, 0, 0];
    expect(() => readNatures(at(0x30, natures(rows)), 0x30)).toThrow(/naturezas.*0x30/i);
  });

  it("throws when a non-neutral row has no +1 and -1 pair", () => {
    const rows = standardNatureRows();
    rows[2] = [1, 1, 0, 0, 0];
    expect(() => readNatures(at(0, natures(rows)), 0)).toThrow(/naturezas/i);
  });
});

describe("readAbilityCount", () => {
  it("is the entry count in the bank header minus the empty first entry", () => {
    expect(readAbilityCount(msgBankHeader(124))).toBe(123);
    expect(readAbilityCount(msgBankHeader(4))).toBe(3);
  });

  it("throws for a bank too short to have a header", () => {
    expect(() => readAbilityCount(new Uint8Array(1))).toThrow();
  });
});

describe("types", () => {
  it("lists the 18 types with readable keys and name references", () => {
    const list = types();
    expect(list).toHaveLength(18);
    expect(list.map((t) => t.key)).toEqual([
      "normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel",
      "unknown", "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark",
    ]);
    expect(list[10]).toEqual({ id: 10, key: "fire", name: { catalog: "type-names", index: 10 } });
  });
});

describe("readGrowthRates", () => {
  const member = (group: number) => growth(Array.from({ length: 101 }, (_, level) => SYNTHETIC_EXPERIENCE(group, level)));
  const members = Array.from({ length: 8 }, (_, i) => member(i >= 6 ? 0 : i));

  it("returns the six used groups with experience for levels 1 to 100", () => {
    const records = readGrowthRates(members);
    expect(records.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(records.map((r) => r.key)).toEqual(["medium-fast", "erratic", "fluctuating", "medium-slow", "fast", "slow"]);
    expect(records[2]!.experience).toHaveLength(100);
    expect(records[2]!.experience[0]).toBe(SYNTHETIC_EXPERIENCE(2, 1));
    expect(records[2]!.experience[99]).toBe(SYNTHETIC_EXPERIENCE(2, 100));
  });

  it("throws for a member that is not 404 bytes", () => {
    expect(() => readGrowthRates([...members.slice(0, 5), new Uint8Array(10)])).toThrow(/404/);
  });

  it("throws when there are fewer than six members", () => {
    expect(() => readGrowthRates(members.slice(0, 3))).toThrow();
  });
});
