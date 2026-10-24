// Script decoder: follows every entry of a script file through jumps and calls and turns the
// reachable commands into named commands with labelled jumps. Commands come from the table in
// data/script-commands.json; one the table lacks is kept as raw. See research.md R2 and R3.
import type { ScriptCommand, ScriptFile } from "@soulsilver/shared/events";
import { formatTextId } from "@soulsilver/shared/text";
import { readU16, readU32 } from "../binary.ts";
import type { ScriptTable } from "./command-table.ts";
import { MOVEMENT_END, SCRIPT_TABLE_END, VAR_BASE } from "./layout.ts";

/** End (2), GoTo (22) and Return (27) leave the straight-line flow. */
const ENDS_FLOW = new Set([2, 22, 27]);

/** Arguments the game lets a script give either as a value or as the id of a variable that holds it. */
const VALUE_OR_VARIABLE = new Set(["text", "species", "move", "item", "trainer"]);

type Value = Extract<ScriptCommand, { args: unknown }>["args"][string];
type Decoded = { size: number; command: { raw: true; id: number } | { name: string; args: Record<string, Value> } };

export function decodeScriptFile(bytes: Uint8Array, table: ScriptTable, file: number, messageBank: number | null): ScriptFile {
  const fail = (message: string): never => {
    throw new Error(`script file ${file}: ${message}`);
  };

  const entries: number[] = [];
  let p = 0;
  for (; ; p += 4) {
    if (p + 4 > bytes.length) fail("the script table has no end marker");
    if (readU16(bytes, p) === SCRIPT_TABLE_END) break;
    entries.push(p + 4 + readU32(bytes, p));
  }
  const codeStart = p + 2;

  const decoded = new Map<number, Decoded>();
  const used = new Uint8Array(bytes.length);
  const jumpTargets = new Set<number>();
  const movementTargets = new Set<number>();
  let partial = false;

  const claim = (start: number, end: number) => {
    for (let k = start; k < end; k++) {
      if (used[k]) fail(`offset 0x${start.toString(16)} is not at the start of a command`);
      used[k] = 1;
    }
  };
  const inCode = (offset: number) => {
    if (offset < codeStart || offset >= bytes.length) fail(`offset 0x${offset.toString(16)} is outside the code`);
  };

  const work = [...entries];
  while (work.length > 0) {
    let o = work.pop()!;
    inCode(o);
    while (!decoded.has(o)) {
      if (used[o]) fail(`offset 0x${o.toString(16)} is not at the start of a command`);
      if (o + 2 > bytes.length) fail(`a command at offset 0x${o.toString(16)} runs past the end of the file`);
      const id = readU16(bytes, o);
      const spec = table.commands.get(id);
      if (!spec) {
        claim(o, o + 2);
        decoded.set(o, { size: 2, command: { raw: true, id } });
        partial = true;
        break;
      }
      let q = o + 2;
      const raw: Record<string, number> = {};
      const args: Record<string, Value> = {};
      for (const a of spec.args) {
        if (a.when) {
          const seen = raw[a.when.arg] ?? 0;
          if (a.when.in ? !a.when.in.includes(seen) : a.when.notIn!.includes(seen)) continue;
        }
        if (q + a.size > bytes.length) fail(`a command at offset 0x${o.toString(16)} runs past the end of the file`);
        const value = a.size === 1 ? bytes[q]! : a.size === 2 ? readU16(bytes, q) : readU32(bytes, q);
        raw[a.name] = value;
        if (a.type === "jump" || a.type === "movement") {
          const target = q + 4 + (value | 0);
          inCode(target);
          (a.type === "jump" ? jumpTargets : movementTargets).add(target);
          if (a.type === "jump") work.push(target);
          args[a.name] = a.type === "jump" ? { label: `@${target}` } : { movement: `@${target}` };
        } else if (a.type === "number") args[a.name] = value;
        else if (value >= VAR_BASE && VALUE_OR_VARIABLE.has(a.type)) args[a.name] = { variable: value };
        else if (a.type === "text") args[a.name] = messageBank === null ? value : { text: formatTextId(messageBank, value) };
        else args[a.name] = { [a.type]: value } as Value;
        q += a.size;
      }
      claim(o, q);
      decoded.set(o, { size: q - o, command: { name: spec.name, args } });
      o = q;
      if (ENDS_FLOW.has(id)) break;
    }
  }

  const movements = new Map<number, { action: string; count: number }[]>();
  for (const start of movementTargets) {
    const steps: { action: string; count: number }[] = [];
    let m = start;
    for (;;) {
      if (m + 4 > bytes.length) fail(`the movement at offset 0x${start.toString(16)} has no end`);
      const action = readU16(bytes, m);
      const count = readU16(bytes, m + 2);
      claim(m, m + 4);
      m += 4;
      if (action === MOVEMENT_END) break;
      steps.push({ action: table.movements.get(action) ?? `movement_${action}`, count });
    }
    movements.set(start, steps);
  }

  const starts = [...decoded.keys()].sort((a, b) => a - b);
  const indexOf = new Map(starts.map((offset, i) => [offset, i]));
  const labelAt = new Map([...new Set([...entries, ...jumpTargets])].sort((a, b) => a - b).map((offset, i) => [offset, `L${i + 1}`]));
  const movementAt = new Map([...movementTargets].sort((a, b) => a - b).map((offset, i) => [offset, `M${i + 1}`]));
  const resolve = (value: Value): Value => {
    if (typeof value === "object" && "label" in value) return { label: labelAt.get(Number(value.label.slice(1)))! };
    if (typeof value === "object" && "movement" in value) return { movement: movementAt.get(Number(value.movement.slice(1)))! };
    return value;
  };

  return {
    kind: "script-file",
    formatVersion: 1,
    file,
    messageBank,
    entries: entries.map((offset) => labelAt.get(offset)!),
    code: starts.map((offset) => {
      const { command } = decoded.get(offset)!;
      if ("raw" in command) return command;
      return { name: command.name, args: Object.fromEntries(Object.entries(command.args).map(([k, v]) => [k, resolve(v)])) };
    }),
    labels: Object.fromEntries([...labelAt].map(([offset, label]) => [label, indexOf.get(offset)!])),
    movements: Object.fromEntries([...movementAt].map(([offset, label]) => [label, movements.get(offset)!])),
    unreachableBytes: used.subarray(codeStart).reduce((n, v) => n + (v ? 0 : 1), 0),
    partial,
  };
}
