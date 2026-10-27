import type { Handler } from "../runner.ts";

export const FLAGS: Record<string, Handler> = {
  SetFlag: (c) => c.host.setFlag(c.raw("flag"), true),
  ClearFlag: (c) => c.host.setFlag(c.raw("flag"), false),
  CheckFlag: (c) => void (c.cmp = c.host.flag(c.raw("flag")) ? 1 : 0),
  SetVar: (c) => c.writeVar(c.ptr("var"), c.raw("val")),
  CopyVar: (c) => c.writeVar(c.ptr("dst"), c.readVar(c.ptr("src"))),
  SetOrCopyVar: (c) => c.writeVar(c.ptr("dst"), c.get("src")),
  AddVar: (c) => c.writeVar(c.ptr("var"), c.readVar(c.ptr("var")) + c.get("var_or_addend")),
  SubVar: (c) => c.writeVar(c.ptr("var"), c.readVar(c.ptr("var")) - c.get("var_or_addend")),
};
