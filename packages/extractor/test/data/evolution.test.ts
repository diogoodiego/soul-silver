import { describe, expect, it } from "vitest";
import { readEvolutions } from "../../src/data/readers/evolution.ts";
import { evolutions } from "../fixtures/game-data/builders.ts";

describe("readEvolutions", () => {
  it("omits empty entries and keeps the original order", () => {
    const list = readEvolutions(evolutions([[2, 0, 196], [3, 0, 197]]));
    expect(list.map((e) => e.into)).toEqual([196, 197]);
  });

  it("returns an empty list when nothing evolves", () => {
    expect(readEvolutions(evolutions([]))).toEqual([]);
  });

  it("keeps the numeric method id next to its key", () => {
    expect(readEvolutions(evolutions([[4, 16, 2]]))[0]).toEqual({
      method: "level",
      methodId: 4,
      parameter: 16,
      condition: { kind: "level", level: 16 },
      into: 2,
    });
  });

  it.each([
    [1, "friendship", { kind: "none" }],
    [2, "friendship-day", { kind: "none" }],
    [3, "friendship-night", { kind: "none" }],
    [4, "level", { kind: "level", level: 9 }],
    [5, "trade", { kind: "none" }],
    [6, "trade-item", { kind: "item", item: 9 }],
    [7, "use-item", { kind: "item", item: 9 }],
    [8, "level-atk-gt-def", { kind: "level", level: 9 }],
    [9, "level-atk-eq-def", { kind: "level", level: 9 }],
    [10, "level-atk-lt-def", { kind: "level", level: 9 }],
    [11, "level-pid-low", { kind: "level", level: 9 }],
    [12, "level-pid-high", { kind: "level", level: 9 }],
    [13, "level-ninjask", { kind: "level", level: 9 }],
    [14, "level-shedinja", { kind: "level", level: 9 }],
    [15, "beauty", { kind: "beauty", minimum: 9 }],
    [16, "use-item-male", { kind: "item", item: 9 }],
    [17, "use-item-female", { kind: "item", item: 9 }],
    [18, "hold-item-day", { kind: "item", item: 9 }],
    [19, "hold-item-night", { kind: "item", item: 9 }],
    [20, "knows-move", { kind: "move", move: 9 }],
    [21, "party-species", { kind: "species", species: 9 }],
    [22, "level-male", { kind: "level", level: 9 }],
    [23, "level-female", { kind: "level", level: 9 }],
    [24, "level-magnetic-field", { kind: "none" }],
    [25, "level-moss-rock", { kind: "none" }],
    [26, "level-ice-rock", { kind: "none" }],
  ] as const)("maps method %i to %s", (methodId, method, condition) => {
    expect(readEvolutions(evolutions([[methodId, 9, 1]]))[0]).toMatchObject({ method, methodId, condition });
  });

  it("keeps an unknown method as unknown with its raw value", () => {
    expect(readEvolutions(evolutions([[99, 7, 1]]))[0]).toMatchObject({
      method: "unknown",
      methodId: 99,
      condition: { kind: "raw", value: 7 },
    });
  });

  it("reads all seven entries when all are used", () => {
    const seven = Array.from({ length: 7 }, (_, k) => [4, k + 1, k + 10] as const);
    expect(readEvolutions(evolutions(seven))).toHaveLength(7);
  });

  it("throws when the record is shorter than 44 bytes", () => {
    expect(() => readEvolutions(evolutions([]).subarray(0, 43))).toThrow(/44/);
  });
});
