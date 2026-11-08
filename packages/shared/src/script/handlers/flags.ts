import type { Handler } from "../runner.ts";

export const FLAGS: Record<string, Handler> = {
  SetFlag: (c) => c.host.setFlag(c.raw("flag"), true),
  ClearFlag: (c) => c.host.setFlag(c.raw("flag"), false),
  /** Spec 027: the flag a variable holds (the hidden-item std script). */
  SetFlagVar: (c) => c.host.setFlag(c.readVar(c.ptr("var")), true),
  CheckFlag: (c) => void (c.cmp = c.host.flag(c.raw("flag")) ? 1 : 0),
  SetVar: (c) => c.writeVar(c.ptr("var"), c.raw("val")),
  CopyVar: (c) => c.writeVar(c.ptr("dst"), c.readVar(c.ptr("src"))),
  SetOrCopyVar: (c) => c.writeVar(c.ptr("dst"), c.get("src")),
  AddVar: (c) => c.writeVar(c.ptr("var"), c.readVar(c.ptr("var")) + c.get("var_or_addend")),
  SubVar: (c) => c.writeVar(c.ptr("var"), c.readVar(c.ptr("var")) - c.get("var_or_addend")),
  // Save_VarsFlags_SetLotoId in retail writes both halves to VAR_LOTO_NUMBER_LO; the high half stays.
  LotoIDSet: (c) => c.host.setVar(VAR_LOTO_NUMBER_LO, c.host.random16()),
};

const VAR_LOTO_NUMBER_LO = 0x403c;
