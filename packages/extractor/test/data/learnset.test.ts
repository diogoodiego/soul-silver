import { describe, expect, it } from "vitest";
import {
  readEggMoves,
  readLevelUp,
  readMachineCompat,
  readMachines,
  readTutorCompat,
  readTutors,
  tutorCompatEntry,
} from "../../src/data/readers/learnset.ts";
import { eggMoves, levelUp, machineTable, personal, syntheticLayout, tutorCompat, tutorList } from "../fixtures/game-data/builders.ts";

const at = (offset: number, bytes: Uint8Array) => {
  const buffer = new Uint8Array(offset + bytes.length + 8);
  buffer.set(bytes, offset);
  return buffer;
};

describe("readLevelUp", () => {
  it("decodes (level << 9) | move in the original order, up to 0xFFFF", () => {
    expect(readLevelUp(levelUp([[1, 33], [13, 77], [13, 79], [37, 402]]))).toEqual([
      { level: 1, move: 33 },
      { level: 13, move: 77 },
      { level: 13, move: 79 },
      { level: 37, move: 402 },
    ]);
  });

  it("returns an empty list for just the terminator", () => {
    expect(readLevelUp(levelUp([]))).toEqual([]);
  });

  it("throws when there is no terminator", () => {
    expect(() => readLevelUp(levelUp([[1, 1]]).subarray(0, 2))).toThrow(/learnset/i);
  });
});

describe("readEggMoves", () => {
  it("maps each species marker (20000 + species) to the moves that follow", () => {
    const map = readEggMoves(eggMoves({ 1: [4, 5], 4: [2], 7: [] }));
    expect([...map.entries()]).toEqual([[1, [4, 5]], [4, [2]], [7, []]]);
  });

  it("throws when the stream has no terminator", () => {
    expect(() => readEggMoves(eggMoves({ 1: [4] }).subarray(0, 4))).toThrow(/ovo/i);
  });

  it("throws on moves before any species marker", () => {
    expect(() => readEggMoves(Uint8Array.of(5, 0, 0xff, 0xff))).toThrow(/ovo/i);
  });
});

describe("readMachineCompat", () => {
  it("maps bit k to machine k+1, HMs included", () => {
    expect(readMachineCompat(personal({ machines: [1, 2, 8, 9, 92, 93, 100] }))).toEqual([1, 2, 8, 9, 92, 93, 100]);
    expect(readMachineCompat(personal())).toEqual([]);
  });
});

describe("readMachines", () => {
  const moves = Array.from({ length: 100 }, (_, k) => 100 + k);

  it("lists TM01–TM92 as ids 1–92 and HM01–HM08 as ids 93–100", () => {
    const records = readMachines(at(0x10, machineTable(moves)), 0x10, 100);
    expect(records).toHaveLength(100);
    expect(records[0]).toEqual({ id: 1, kind: "tm", number: 1, move: 100 });
    expect(records[91]).toEqual({ id: 92, kind: "tm", number: 92, move: 191 });
    expect(records[92]).toEqual({ id: 93, kind: "hm", number: 1, move: 192 });
    expect(records[99]).toEqual({ id: 100, kind: "hm", number: 8, move: 199 });
  });

  it("throws when a move is outside 1–467", () => {
    const bad = [...moves];
    bad[5] = 468;
    expect(() => readMachines(at(0, machineTable(bad)), 0, 100)).toThrow(/TM/);
    bad[5] = 0;
    expect(() => readMachines(at(0, machineTable(bad)), 0, 100)).toThrow(/TM/);
  });

  it("throws when the entry after the table is not 0", () => {
    const table = machineTable(moves);
    table[200] = 1;
    expect(() => readMachines(at(0, table), 0, 100)).toThrow(/TM/);
  });
});

describe("readTutors", () => {
  const list = [
    { move: 291, cost: 40, area: 0 },
    { move: 189, cost: 32, area: 1 },
    { move: 29, cost: 0, area: 3 },
  ];

  it("decodes the records, keeping a free tutor's cost 0", () => {
    const records = readTutors(at(0x20, tutorList(list)), 0x20, 3);
    expect(records).toEqual(list.map((r, id) => ({ id, ...r })));
  });

  it("does not read past the count (a garbage record follows the real table)", () => {
    expect(readTutors(at(0, tutorList(list)), 0, 3)).toHaveLength(3);
  });

  it("throws when an area is above 3", () => {
    expect(() => readTutors(at(0, tutorList([{ move: 1, cost: 1, area: 4 }])), 0, 1)).toThrow(/tutor/i);
  });

  it("throws when a move is outside 1–467", () => {
    expect(() => readTutors(at(0, tutorList([{ move: 500, cost: 1, area: 0 }])), 0, 1)).toThrow(/tutor/i);
  });
});

describe("tutor compatibility", () => {
  const layout = syntheticLayout();
  const bytes = tutorCompat([0b011n, 0n, 0b100n, 0n, 0b001n, 0b111n, 0b001n, 0b111n]);

  it("reads the set bits as tutor ids", () => {
    expect(readTutorCompat(bytes, 0, 3)).toEqual([0, 1]);
    expect(readTutorCompat(bytes, 1, 3)).toEqual([]);
    expect(readTutorCompat(bytes, 5, 3)).toEqual([0, 1, 2]);
  });

  it("ignores bits above the tutor count", () => {
    expect(readTutorCompat(tutorCompat([0b1111n]), 0, 3)).toEqual([0, 1, 2]);
  });

  it("throws for an entry past the end of the file", () => {
    expect(() => readTutorCompat(bytes, 8, 3)).toThrow(/tutor/i);
  });

  it("maps species to entry i-1 and forms to the entries after the species", () => {
    expect(tutorCompatEntry(layout, 1)).toBe(0);
    expect(tutorCompatEntry(layout, 6)).toBe(5);
    expect(tutorCompatEntry(layout, 9)).toBe(6);
    expect(tutorCompatEntry(layout, 10)).toBe(7);
  });

  it("has no entry for the egg slots or beyond", () => {
    expect(tutorCompatEntry(layout, 7)).toBeUndefined();
    expect(tutorCompatEntry(layout, 11)).toBeUndefined();
    expect(tutorCompatEntry(layout, 0)).toBeUndefined();
  });
});
