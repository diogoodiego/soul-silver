import { parseEventsJson, type CommandSpec, type ScriptCommandsFile } from "@soulsilver/shared/events";
// Embedded at build time, so bundles (the app) need no file next to them.
import shippedTable from "../../data/script-commands.json" with { type: "json" };

/** The command and movement tables indexed by id, as the script decoder reads them. */
export interface ScriptTable {
  commands: ReadonlyMap<number, CommandSpec>;
  movements: ReadonlyMap<number, string>;
}

export function loadScriptTable(file: ScriptCommandsFile): ScriptTable {
  return {
    commands: new Map(file.commands.map((c) => [c.id, c])),
    movements: new Map(file.movements.map((m) => [m.id, m.name])),
  };
}

/** The table shipped with the extractor (`data/script-commands.json`), validated on load (principle III). */
export function readScriptTable(text = JSON.stringify(shippedTable)): ScriptTable {
  const result = parseEventsJson("script-commands", text, "script-commands.json");
  if (!result.ok) throw new Error(`${result.error.file}: ${result.error.path}: ${result.error.problem}`);
  return loadScriptTable(result.data);
}
