import type { Handler } from "../runner.ts";

// Trainer commands (spec 022). TrainerBattle blocks until the server's battle ends; the result is
// then read by CheckBattleWon.

export const TRAINER: Record<string, Handler> = {
  // The common trainer script passes both trainers through variables (0x8004, 0x8005).
  TrainerBattle: (c) => c.block({ kind: "battle", trainer: c.get("trainer"), partner: c.get("arg1") }),
  CheckBattleWon: (c) => c.writeVar(c.ptr("var"), c.host.battleWon() ? 1 : 0),
  SetTrainerFlag: (c) => c.host.setTrainerFlag(c.get("var_or_trno"), true),
  ClearTrainerFlag: (c) => c.host.setTrainerFlag(c.get("var_or_trno"), false),
  CheckTrainerFlag: (c) => void (c.cmp = c.host.trainerFlag(c.get("var_or_trno")) ? 1 : 0),
  // shortcut: the records screen's counters are not kept yet; count them when a spec adds that screen.
  AddSpecialGameStat: () => undefined,
};
