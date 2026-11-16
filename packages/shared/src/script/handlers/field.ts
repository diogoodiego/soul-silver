import type { Handler } from "../runner.ts";

// Field moves (spec 025): the common scripts of file 146 ask the party, the badge and the yes/no
// themselves; these are the commands they call (pokeheartgold src/scrcmd_c.c, scrcmd_party.c).

const nothing: Handler = () => undefined;

/** RockClimb, Waterfall, Whirlpool: the player crosses the tiles ahead, as the original's field task. */
const cross =
  (kind: "rockClimb" | "waterfall" | "whirlpool"): Handler =>
  (c) => {
    const path = c.host.crossing(kind);
    if (path) c.block({ kind: "cutscene", actors: ["player"], steps: [{ kind: "walk", actor: "player", dir: path.dir, count: path.count }] });
  };

export const FIELD: Record<string, Handler> = {
  // Party size (6) when no member knows it.
  GetPartySlotWithMove: (c) => c.writeVar(c.ptr("arg0"), c.host.partySlotWithMove(c.get("arg1"))),
  // Looks the client does not draw: the move's cut-in, the follower walking up, its mood and emotes.
  ScrCmd_183: nothing,
  ScrCmd_598: nothing,
  ScrCmd_600: nothing,
  ScrCmd_606: nothing,
  ScrCmd_607: nothing,
  ScrCmd_728: nothing,
  ScrCmd_731: nothing,
  ScrCmd_732: nothing,
  ScrCmd_734: nothing,
  // The field-move effect: its variable turns non-zero when the animation ends, and the scripts wait on it.
  ScrCmd_560: (c) => c.writeVar(c.ptr("arg1"), 1),
  // 1 when no follower is out.
  ScrCmd_730: (c) => c.writeVar(c.ptr("arg0"), c.host.companionOut() ? 0 : 1),
  // Follower mood checks: no mood is kept, so the neutral branch.
  ScrCmd_733: (c) => c.writeVar(c.ptr("arg1"), 0),
  ScrCmd_829: (c) => c.writeVar(c.ptr("arg0"), 0),
  // No one walks with the player in this game.
  CheckEscortMode: (c) => c.writeVar(c.ptr("arg0"), 0),
  // 0 clears, 1 sets, 2 asks; cleared on leaving the map.
  StrengthFlagAction: (c) => {
    const action = c.get("action");
    if (action === 2) c.writeVar(c.ptr("var"), c.host.strength() ? 1 : 0);
    else c.host.setStrength(action === 1);
  },
  // A wild Pokémon may come out of the rock; if none does, whether an item was found (arg1) and which (arg2).
  RockSmashItemCheck: (c) => {
    const item = c.host.fieldEncounter("rockSmash") ? 0 : c.host.rockSmashItem();
    c.writeVar(c.ptr("arg1"), item ? 1 : 0);
    c.writeVar(c.ptr("arg2"), item);
  },
  TryHeadbuttEncounter: (c) => c.writeVar(c.ptr("arg0"), c.host.fieldEncounter("headbutt") ? 1 : 0),
  RockClimb: cross("rockClimb"),
  Waterfall: cross("waterfall"),
  Whirlpool: cross("whirlpool"),
};
