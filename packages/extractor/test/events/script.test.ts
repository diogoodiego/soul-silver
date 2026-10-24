import type { CommandSpec, ScriptCommandsFile } from "@soulsilver/shared/events";
import { parseEventsFile } from "@soulsilver/shared/events";
import { describe, expect, it } from "vitest";
import { loadScriptTable } from "../../src/events/command-table.ts";
import { decodeScriptFile } from "../../src/events/script.ts";
import { buildScriptFile, cmd, concat, rel } from "../fixtures/events/builders.ts";

type Arg = CommandSpec["args"][number];
const num = (name: string, size: 1 | 2 | 4): Arg => ({ name, type: "number", size });
const arg = (name: string, type: Arg["type"], size: 1 | 2 | 4): Arg => ({ name, type, size });

const table = loadScriptTable({
  kind: "script-commands",
  formatVersion: 1,
  commands: [
    { id: 0, name: "Noop", args: [] },
    { id: 2, name: "End", args: [] },
    { id: 22, name: "GoTo", args: [arg("dest", "jump", 4)] },
    { id: 27, name: "Return", args: [] },
    { id: 28, name: "GoToIf", args: [num("condition", 1), arg("dest", "jump", 4)] },
    { id: 30, name: "SetFlag", args: [arg("flag", "flag", 2)] },
    { id: 45, name: "NPCMsg", args: [arg("msg_id", "text", 1)] },
    { id: 94, name: "ApplyMovement", args: [num("arg0", 2), arg("movement", "movement", 4)] },
    { id: 400, name: "FlashAction", args: [num("action", 1), { name: "var", type: "variable", size: 2, when: { arg: "action", in: [2] } }] },
    { id: 500, name: "Give", args: [arg("species", "species", 2), arg("item", "item", 2), arg("trainer", "trainer", 2), arg("var", "variable", 2)] },
  ],
  movements: [{ id: 12, name: "StepUp" }, { id: 254, name: "EndMovement" }],
} satisfies ScriptCommandsFile);

const movement = (...steps: [number, number][]) => concat(...steps.flatMap(([a, n]) => [new Uint8Array([a & 255, a >> 8, n & 255, n >> 8])]));
const decode = (bytes: Uint8Array, bank: number | null = 12) => decodeScriptFile(bytes, table, 7, bank);

describe("loadScriptTable", () => {
  it("rejects nothing the schema accepts and indexes commands and movements by id", () => {
    expect(table.commands.get(45)?.name).toBe("NPCMsg");
    expect(table.movements.get(12)).toBe("StepUp");
  });
});

describe("decodeScriptFile", () => {
  it("decodes commands with named arguments and a text id in the file's message bank", () => {
    const file = decode(buildScriptFile([0], concat(cmd(45, [1, 3]), cmd(30, [2, 0x123]), cmd(2))));
    expect(file.code).toEqual([
      { name: "NPCMsg", args: { msg_id: { text: "0012:3" } } },
      { name: "SetFlag", args: { flag: { flag: 0x123 } } },
      { name: "End", args: {} },
    ]);
    expect(file.entries).toEqual(["L1"]);
    expect(file.labels).toEqual({ L1: 0 });
    expect(file.partial).toBe(false);
    expect(file.unreachableBytes).toBe(0);
  });

  it("types species, item, trainer and variable arguments", () => {
    const file = decode(buildScriptFile([0], concat(cmd(500, [2, 25], [2, 4], [2, 9], [2, 0x4001]), cmd(2))));
    expect(file.code[0]).toEqual({ name: "Give", args: { species: { species: 25 }, item: { item: 4 }, trainer: { trainer: 9 }, var: { variable: 0x4001 } } });
  });

  it("reads an argument at or above 0x4000 as a variable, since the game takes a value or a variable there", () => {
    const file = decode(buildScriptFile([0], concat(cmd(500, [2, 0x8004], [2, 0x4000], [2, 0x3fff], [2, 0x8001]), cmd(2))));
    expect(file.code[0]).toEqual({ name: "Give", args: { species: { variable: 0x8004 }, item: { variable: 0x4000 }, trainer: { trainer: 0x3fff }, var: { variable: 0x8001 } } });
  });

  it("turns jumps into labels numbered by position and follows both sides of a branch", () => {
    const goToIf = cmd(28, [1, 1], rel(12, 3));
    const body = concat(goToIf, cmd(45, [1, 1]), cmd(2), cmd(45, [1, 2]), cmd(2));
    expect(body.length).toBe(7 + 3 + 2 + 3 + 2);
    const file = decode(buildScriptFile([0], body));
    expect(file.code.map((c) => ("name" in c ? c.name : "raw"))).toEqual(["GoToIf", "NPCMsg", "End", "NPCMsg", "End"]);
    expect(file.labels).toEqual({ L1: 0, L2: 3 });
    expect(file.code[0]).toEqual({ name: "GoToIf", args: { condition: 1, dest: { label: "L2" } } });
  });

  it("gives every entry of the table a label, in table order", () => {
    const body = concat(cmd(2), cmd(27));
    const file = decode(buildScriptFile([2, 0], body));
    expect(file.entries).toEqual(["L2", "L1"]);
    expect(file.labels).toEqual({ L1: 0, L2: 1 });
  });

  it("stops a flow at End, GoTo and Return", () => {
    const file = decode(buildScriptFile([0], concat(cmd(22, rel(8, 2)), cmd(2), cmd(2))));
    expect(file.code).toHaveLength(2);
  });

  it("follows a jump backwards", () => {
    const file = decode(buildScriptFile([0], concat(cmd(0), cmd(22, rel(0, 4)))));
    expect(file.code).toEqual([{ name: "Noop", args: {} }, { name: "GoTo", args: { dest: { label: "L1" } } }]);
  });

  it("reads a movement sequence into named steps and labels it", () => {
    const body = concat(cmd(94, [2, 255], rel(10, 4)), cmd(2), movement([12, 2], [254, 0]));
    const file = decode(buildScriptFile([0], body));
    expect(file.code[0]).toEqual({ name: "ApplyMovement", args: { arg0: 255, movement: { movement: "M1" } } });
    expect(file.movements).toEqual({ M1: [{ action: "StepUp", count: 2 }] });
  });

  it("falls back to a generic name for a movement action the table lacks", () => {
    const body = concat(cmd(94, [2, 1], rel(10, 4)), cmd(2), movement([99, 1], [254, 0]));
    const file = decode(buildScriptFile([0], body));
    expect(file.movements.M1).toEqual([{ action: "movement_99", count: 1 }]);
  });

  it("includes optional arguments only when the condition holds", () => {
    const file = decode(buildScriptFile([0], concat(cmd(400, [1, 2], [2, 0x40]), cmd(400, [1, 1]), cmd(2))));
    expect(file.code[0]).toEqual({ name: "FlashAction", args: { action: 2, var: { variable: 0x40 } } });
    expect(file.code[1]).toEqual({ name: "FlashAction", args: { action: 1 } });
  });

  it("keeps a command the table does not know as raw, in place, and marks the script partial", () => {
    const file = decode(buildScriptFile([0], concat(cmd(45, [1, 1]), cmd(9999), cmd(2))));
    expect(file.code).toEqual([{ name: "NPCMsg", args: { msg_id: { text: "0012:1" } } }, { raw: true, id: 9999 }]);
    expect(file.partial).toBe(true);
  });

  it("keeps the text argument as a number when the file has no message bank", () => {
    const file = decode(buildScriptFile([0], concat(cmd(45, [1, 3]), cmd(2))), null);
    expect(file.code[0]).toEqual({ name: "NPCMsg", args: { msg_id: 3 } });
    expect(file.messageBank).toBeNull();
  });

  it("counts bytes no entry reaches as unreachable and does not decode them", () => {
    const file = decode(buildScriptFile([0], concat(cmd(2), cmd(2), new Uint8Array([0, 0]))));
    expect(file.code).toHaveLength(1);
    expect(file.unreachableBytes).toBe(4);
  });

  it("produces a file the shared schema accepts", () => {
    const file = decode(buildScriptFile([0], concat(cmd(28, [1, 1], rel(9, 3)), cmd(2), cmd(2))));
    expect(parseEventsFile("script-file", file, "script.json").ok).toBe(true);
  });

  it.each([
    ["a table without the end marker", new Uint8Array([4, 0, 0, 0, 1, 2, 3, 4]), /end marker/],
    ["an entry before the code", buildScriptFile([-4], concat(cmd(2))), /outside the code/],
    ["a jump past the end", buildScriptFile([0], concat(cmd(22, rel(500, 2)))), /outside the code/],
    ["a jump into the middle of a command", buildScriptFile([0], concat(cmd(28, [1, 1], rel(1, 3)), cmd(2))), /not at the start of a command/],
    ["a command cut by the end of the file", buildScriptFile([0], new Uint8Array([45, 0])), /past the end/],
  ])("fails with a clear message for %s", (_name, bytes, message) => {
    expect(() => decode(bytes)).toThrow(message);
  });
});
