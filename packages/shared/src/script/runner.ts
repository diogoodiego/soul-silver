// Runs one script for one player (spec 020, research.md R1-R3): a step machine over the commands
// the extractor decoded. Semantics follow pret/pokeheartgold (src/scrcmd*.c).
import type { ScriptCommand, ScriptFile } from "../events/schemas.ts";
import { formatTextId } from "../text/ids.ts";
import type { ScriptHost, ScriptRequest, TextBuffer } from "./host.ts";

/** Commands run without blocking before the script counts as stuck in a loop. */
export const MAX_STEPS = 10_000;
/** Nested Call and CallStd levels before the script is stopped. */
export const MAX_DEPTH = 32;
/** Arguments from here up name a variable (vars.h VAR_BASE); from SPECIAL_VAR_BASE up they live only while scripts run. */
export const VAR_BASE = 0x4000;
export const SPECIAL_VAR_BASE = 0x8000;
/** VAR_SPECIAL_RESULT: where most commands put their answer. */
export const VAR_RESULT = 0x800c;

export type Value = Extract<ScriptCommand, { args: unknown }>["args"][string];

export interface MissingCommand {
  command: string;
  file: number;
  entry: number;
  index: number;
}

export type RunState =
  | { kind: "running" }
  | { kind: "blocked"; request: ScriptRequest }
  | { kind: "done" }
  | ({ kind: "missing" } & MissingCommand)
  | { kind: "aborted"; reason: string };

/** What a handler sees of the command it runs. */
export interface CommandContext {
  readonly host: ScriptHost;
  readonly name: string;
  readonly args: Record<string, Value>;
  readonly file: ScriptFile;
  /** ScriptGetVar: a value, or what the variable it names holds. */
  get(arg: string): number;
  /** ScriptGetVarPointer: the id of the variable an argument names. */
  ptr(arg: string): number;
  /** The raw number of an argument, never read through a variable. */
  raw(arg: string): number;
  readVar(id: number): number;
  writeVar(id: number, value: number): void;
  cmp: number;
  jump(arg: string): void;
  call(arg: string): void;
  ret(): void;
  /** CallStd: runs a global script in a context of its own, then comes back. */
  callScript(scriptId: number): void;
  end(): void;
  buffers: Record<number, TextBuffer>;
  /** The file's message bank as a text id prefix; numbers stay numbers when the file has none. */
  text(index: number): string;
  /** Blocks the script; `then` runs on resume with the client's answer. */
  block(request: ScriptRequest, then?: (answer: number) => void): void;
  /** Ends the script as if the command were missing (a later spec owns it). */
  unsupported(): void;
}

export type Handler = (ctx: CommandContext) => void;

interface Context {
  file: ScriptFile;
  entry: number;
  pc: number;
  stack: number[];
  cmp: number;
}

export interface Snapshot {
  file: number;
  entry: number;
  pc: number;
  command: string;
  depth: number;
}

export interface Runner {
  readonly state: RunState;
  /** Runs until the script blocks or ends. */
  step(): RunState;
  /** Continues a blocked script; `answer` is the client's reply when the request has one. */
  resume(answer?: number): RunState;
  snapshot(): Snapshot | undefined;
}

class Abort extends Error {}

const nameOf = (c: ScriptCommand) => ("raw" in c ? `raw:${c.id}` : c.name);

export function createRunner(host: ScriptHost, handlers: ReadonlyMap<string, Handler>, start: { file: ScriptFile; entry: number }): Runner {
  const special = new Map<number, number>();
  const buffers: Record<number, TextBuffer> = {};
  const contexts: Context[] = [];
  let state: RunState = { kind: "running" };
  let then: ((answer: number) => void) | undefined;

  const abort = (reason: string): never => {
    throw new Abort(reason);
  };

  function enter(file: ScriptFile, entry: number): void {
    const label = file.entries[entry];
    if (label === undefined) abort(`script file ${file.file} has no entry ${entry}`);
    if (contexts.length >= MAX_DEPTH) abort("too many nested scripts");
    contexts.push({ file, entry, pc: file.labels[label!]!, stack: [], cmp: 0 });
  }

  function readVar(id: number): number {
    if (id < VAR_BASE) abort(`${id} is not a variable`);
    return id >= SPECIAL_VAR_BASE ? (special.get(id) ?? 0) : host.getVar(id);
  }
  function writeVar(id: number, value: number): void {
    if (id < VAR_BASE) abort(`${id} is not a variable`);
    const v = value & 0xffff;
    if (id >= SPECIAL_VAR_BASE) special.set(id, v);
    else host.setVar(id, v);
  }

  function contextFor(ctx: Context, name: string, args: Record<string, Value>): CommandContext {
    const arg = (a: string): Value => {
      const v = args[a];
      if (v === undefined) abort(`${name} has no argument ${a}`);
      return v!;
    };
    const target = (a: string) => {
      const v = arg(a);
      if (typeof v !== "object" || !("label" in v)) return abort(`${name}.${a} is not a jump`);
      const pc = ctx.file.labels[v.label];
      return pc === undefined ? abort(`label ${v.label} does not exist`) : pc;
    };
    return {
      host,
      name,
      args,
      file: ctx.file,
      get(a) {
        const v = arg(a);
        if (typeof v === "number") return v >= VAR_BASE ? readVar(v) : v;
        if ("variable" in v) return readVar(v.variable);
        const n: unknown = Object.values(v)[0];
        return typeof n === "number" ? n : abort(`${name}.${a} is not a number`);
      },
      ptr(a) {
        const v = arg(a);
        const id = typeof v === "number" ? v : "variable" in v ? v.variable : -1;
        if (id < VAR_BASE) abort(`${name}.${a} is not a variable`);
        return id;
      },
      raw(a) {
        const v = arg(a);
        if (typeof v === "number") return v;
        const n: unknown = Object.values(v)[0];
        return typeof n === "number" ? n : abort(`${name}.${a} is not a number`);
      },
      readVar,
      writeVar,
      get cmp() {
        return ctx.cmp;
      },
      set cmp(v) {
        ctx.cmp = v;
      },
      jump(a) {
        ctx.pc = target(a);
      },
      call(a) {
        const pc = target(a);
        if (ctx.stack.length >= MAX_DEPTH) abort("call stack full");
        ctx.stack.push(ctx.pc);
        ctx.pc = pc;
      },
      ret() {
        const pc = ctx.stack.pop();
        if (pc === undefined) abort("Return with nothing to return to");
        ctx.pc = pc!;
      },
      callScript(scriptId) {
        const at = host.resolve(scriptId);
        const file = at && host.file(at.file);
        if (!at || !file) abort(`script ${scriptId} does not exist`);
        enter(file!, at!.entry);
      },
      end() {
        contexts.pop();
      },
      buffers,
      text(index) {
        const bank = ctx.file.messageBank;
        return bank === null ? String(index) : formatTextId(bank, index);
      },
      block(request, after) {
        state = { kind: "blocked", request };
        then = after;
      },
      unsupported() {
        state = { kind: "missing", command: name, file: ctx.file.file, entry: ctx.entry, index: ctx.pc - 1 };
      },
    };
  }

  function run(): RunState {
    let steps = 0;
    try {
      while (state.kind === "running") {
        const ctx = contexts.at(-1);
        if (!ctx) {
          state = { kind: "done" };
          break;
        }
        if (++steps > MAX_STEPS) abort(`more than ${MAX_STEPS} commands without waiting`);
        const index = ctx.pc;
        const command = ctx.file.code[index];
        if (!command) abort(`script file ${ctx.file.file} runs past its end`);
        ctx.pc++;
        const handler = "raw" in command! ? undefined : handlers.get(command!.name);
        if (!handler) {
          state = { kind: "missing", command: nameOf(command!), file: ctx.file.file, entry: ctx.entry, index };
          break;
        }
        handler(contextFor(ctx, (command as { name: string }).name, (command as { args: Record<string, Value> }).args));
      }
    } catch (error) {
      if (!(error instanceof Abort)) throw error;
      state = { kind: "aborted", reason: error.message };
    }
    return state;
  }

  try {
    enter(start.file, start.entry);
  } catch (error) {
    if (!(error instanceof Abort)) throw error;
    state = { kind: "aborted", reason: error.message };
  }

  return {
    get state() {
      return state;
    },
    step: run,
    resume(answer = 0) {
      if (state.kind !== "blocked") return state;
      const after = then;
      then = undefined;
      state = { kind: "running" };
      try {
        after?.(answer);
      } catch (error) {
        if (!(error instanceof Abort)) throw error;
        state = { kind: "aborted", reason: error.message };
        return state;
      }
      return run();
    },
    snapshot() {
      const ctx = contexts.at(-1);
      if (!ctx) return undefined;
      const at = state.kind === "blocked" ? ctx.pc - 1 : ctx.pc;
      const command = ctx.file.code[at];
      return { file: ctx.file.file, entry: ctx.entry, pc: at, command: command ? nameOf(command) : "", depth: contexts.length };
    },
  };
}
