import type { Handler } from "../runner.ts";

/** sConditionTable: the condition (< = > <= >= !=) against the comparison result (0 less, 1 equal, 2 greater). */
const CONDITIONS = [
  [true, false, false],
  [false, true, false],
  [false, false, true],
  [true, true, false],
  [false, true, true],
  [true, false, true],
];
const compare = (a: number, b: number) => (a < b ? 0 : a === b ? 1 : 2);
const holds = (condition: number, cmp: number) => CONDITIONS[condition]?.[cmp] ?? false;

export const FLOW: Record<string, Handler> = {
  Noop: () => undefined,
  Dummy: () => undefined,
  End: (c) => c.end(),
  GoTo: (c) => c.jump("dest"),
  Call: (c) => c.call("sub"),
  Return: (c) => c.ret(),
  GoToIf: (c) => holds(c.raw("condition"), c.cmp) && c.jump("dest"),
  CallIf: (c) => holds(c.raw("condition"), c.cmp) && c.call("sub"),
  CallStd: (c) => c.callScript(c.raw("id")),
  CompareVarToValue: (c) => void (c.cmp = compare(c.readVar(c.ptr("var")), c.raw("val"))),
  // Both arguments name variables (ScrCmd_CompareVarToVar reads two pointers).
  CompareVarToVar: (c) => void (c.cmp = compare(c.readVar(c.ptr("a")), c.readVar(c.ptr("b")))),
};
