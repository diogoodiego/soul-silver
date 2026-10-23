import { describe, expect, it } from "vitest";
import { TEXT_VARIABLES, variableByCommand, variableByName } from "../../src/text/variables.ts";

describe("variable table", () => {
  it.each([
    [0x0100, "pokemon-species", "text"],
    [0x0101, "pokemon-name", "text"],
    [0x0103, "trainer-name", "text"],
    [0x0105, "ability", "text"],
    [0x0106, "move", "text"],
    [0x0108, "item", "text"],
    [0x010b, "box", "text"],
    [0x010d, "stat", "text"],
    [0x010f, "type", "text"],
    [0x0111, "status", "text"],
    [0x0112, "pocket", "text"],
    [0x011c, "phrase", "text"],
    [0x0132, "number1", "number"],
    [0x013b, "number10", "number"],
  ] as const)("command 0x%s is %s", (command, name, value) => {
    expect(variableByCommand(command)).toEqual({ name, command, value });
    expect(variableByName(name)).toEqual({ name, command, value });
  });

  it("returns undefined for an unlisted command", () => {
    expect(variableByCommand(0x0104)).toBeUndefined();
    expect(variableByName("nope")).toBeUndefined();
  });

  it("has no duplicate names or commands", () => {
    expect(new Set(TEXT_VARIABLES.map((v) => v.name)).size).toBe(TEXT_VARIABLES.length);
    expect(new Set(TEXT_VARIABLES.map((v) => v.command)).size).toBe(TEXT_VARIABLES.length);
  });

  it("resolves varXXXX names to their command", () => {
    expect(variableByName("var0104")).toBeUndefined();
  });
});
