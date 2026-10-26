import { describe, expect, it } from "vitest";
import { classifyPermission } from "../../src/maps/collision.ts";

describe("classifyPermission", () => {
  it("treats the 0x80 flag as blocked, whatever the behavior", () => {
    expect(classifyPermission(0x8000)).toEqual({ category: "blocked", raw: 0x8000 });
    expect(classifyPermission(0x8002)).toEqual({ category: "blocked", raw: 0x8002 });
  });

  it("maps behavior 0 without the flag to free", () => {
    expect(classifyPermission(0x0000)).toEqual({ category: "free", raw: 0 });
  });

  it.each([0x02, 0x03])("maps behavior 0x%s to tall grass", (behavior) => {
    expect(classifyPermission(behavior)).toEqual({ category: "tallGrass", raw: behavior });
  });

  it.each([0x10, 0x11, 0x13, 0x15])("maps behavior 0x%s to water", (behavior) => {
    expect(classifyPermission(behavior)).toEqual({ category: "water", raw: behavior });
  });

  it.each([
    [0x38, "east"],
    [0x39, "west"],
    [0x3a, "north"],
    [0x3b, "south"],
  ] as const)("maps behavior 0x%s to a ledge facing %s", (behavior, direction) => {
    expect(classifyPermission(behavior)).toEqual({ category: "ledge", raw: behavior, direction });
  });

  it("keeps a ledge a ledge when the ROM sets the blocked flag on it", () => {
    expect(classifyPermission(0x803b)).toEqual({ category: "ledge", raw: 0x803b, direction: "south" });
  });

  it("keeps other flag bits in raw without changing the category", () => {
    expect(classifyPermission(0x0602)).toEqual({ category: "tallGrass", raw: 0x0602 });
  });

  it("maps an unknown behavior to special, preserving the original value", () => {
    expect(classifyPermission(0x0465)).toEqual({ category: "special", raw: 0x0465 });
  });
});
