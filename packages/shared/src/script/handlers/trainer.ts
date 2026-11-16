import type { Handler } from "../runner.ts";

// Trainer commands (spec 022). TrainerBattle blocks until the server's battle ends; the result is
// then read by CheckBattleWon.

/** BattleOutcome of the original (pokeheartgold battle.h). */
const OUTCOME_WON = 1;
const OUTCOME_CAUGHT = 4;

export const TRAINER: Record<string, Handler> = {
  // The common trainer script passes both trainers through variables (0x8004, 0x8005).
  TrainerBattle: (c) => c.block({ kind: "battle", trainer: c.get("trainer"), partner: c.get("arg1") }),
  // Item 032.5: the trainer arg0 fights beside the player against arg1 and arg2 (Lance in the Rocket HQ, 90:3); arg3 is unused.
  MultiBattle: (c) => c.block({ kind: "battle", trainer: c.get("arg1"), partner: c.get("arg2"), ally: c.get("arg0") }),
  // Spec 030.9: a static encounter; the shiny argument is ignored (always 0 in the scripts that use it so far).
  // Item 032.3: shiny 1 is the Lake of Rage's red Gyarados.
  WildBattle: (c) => c.block({ kind: "wild", species: c.get("species"), level: c.get("level"), ...(c.get("shiny") ? { shiny: true as const } : {}) }),
  GetStaticEncounterOutcome: (c) => c.writeVar(c.ptr("arg0"), c.host.battleOutcome?.() ?? 0),
  // Item 032.4: 1 when the Pokémon got away, as the Rocket HQ's Electrodes read it (map 248: a 1 leaves one standing, uncounted).
  StaticWildWonOrCaughtCheck: (c) => c.writeVar(c.ptr("arg0"), [OUTCOME_WON, OUTCOME_CAUGHT].includes(c.host.battleOutcome?.() ?? 0) ? 0 : 1),
  // Item 032.4: a Rocket HQ floor trap (map 247), a wild battle with the Pokémon (arg0) and level (arg1) hidden under it.
  RocketTrapBattle: (c) => c.block({ kind: "wild", species: c.get("arg0"), level: c.get("arg1") }),
  CheckBattleWon: (c) => c.writeVar(c.ptr("var"), c.host.battleWon() ? 1 : 0),
  SetTrainerFlag: (c) => c.host.setTrainerFlag(c.get("var_or_trno"), true),
  ClearTrainerFlag: (c) => c.host.setTrainerFlag(c.get("var_or_trno"), false),
  CheckTrainerFlag: (c) => void (c.cmp = c.host.trainerFlag(c.get("var_or_trno")) ? 1 : 0),
  // shortcut: the records screen's counters are not kept yet; count them when a spec adds that screen.
  AddSpecialGameStat: () => undefined,
};
