import { describe, expect, it } from "vitest";
import { diffEntity, type Entity } from "../../src/game/entity.ts";

const base: Entity = { id: 1, kind: "player", area: "a", x: 10, y: 20, facing: "south", data: { name: "Ana" } };

describe("diffEntity", () => {
  it("returns undefined when nothing changed", () => {
    expect(diffEntity(base, { ...base, data: { name: "Ana" } })).toBeUndefined();
  });

  it("returns only the changed fields", () => {
    expect(diffEntity(base, { ...base, x: 13, facing: "east" })).toEqual({ id: 1, x: 13, facing: "east" });
  });

  it("sends the whole data object when any data field changes", () => {
    expect(diffEntity(base, { ...base, data: { name: "Ana", hp: 3 } })).toEqual({ id: 1, data: { name: "Ana", hp: 3 } });
  });
});
