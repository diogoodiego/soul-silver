import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scriptCommandsFile } from "../../src/events/schemas.ts";
import { SCRIPT_HANDLERS, createRunner } from "../../src/script/index.ts";
import { fakeHost, makeScript } from "./fixture.ts";

// Every handler reads the arguments the extractor's command table gives that command (hand-written table, not ROM data).

const table = scriptCommandsFile.parse(JSON.parse(readFileSync(new URL("../../../extractor/data/script-commands.json", import.meta.url), "utf8")));
const specs = new Map(table.commands.map((c) => [c.name, c]));
const sample = { number: 0x4001, variable: { variable: 0x4001 }, flag: { flag: 1 }, text: { text: "0001:1" }, jump: { label: "L1" }, movement: { movement: "M1" }, species: { species: 1 }, item: { item: 1 }, move: { move: 1 }, trainer: { trainer: 1 } } as const;

describe("handlers against the command table", () => {
  it.each([...SCRIPT_HANDLERS.keys()])("%s exists and reads only its own arguments", (name) => {
    const spec = specs.get(name);
    expect(spec).toBeDefined();
    const args = Object.fromEntries(spec!.args.map((a) => [a.name, sample[a.type]]));
    const runner = createRunner(fakeHost(), SCRIPT_HANDLERS, { file: makeScript([[name, args], ["End"]]), entry: 0 });
    const state = runner.step();
    expect(state.kind === "aborted" ? state.reason : "").not.toMatch(/has no argument|is not a/);
  });
});
