import { STARTER_LEVEL, STARTERS } from "../../progression/starter.ts";
import type { Handler } from "../runner.ts";

/** VAR_PLAYER_STARTER (vars.h), where SetStarterChoice keeps the species. */
const VAR_PLAYER_STARTER = 0x4030;

export const POKEMON: Record<string, Handler> = {
  GiveMon: (c) => c.writeVar(c.ptr("retvar"), c.host.giveMon(c.get("species"), c.get("level"), c.get("heldItem"), c.get("form")) ? 1 : 0),
  ChooseStarter: (c) => {
    // shortcut: the new game still hands out a starter (spec 017), so the lab scene is skipped when one is in the party; drop this once the new-game pick goes.
    if (Array.from({ length: c.host.partyCount() }, (_, i) => c.host.partySpecies(i)).some((s) => (STARTERS as readonly number[]).includes(s))) return;
    c.block({ kind: "starter", species: [...STARTERS] }, (answer) => {
      c.host.giveMon(STARTERS[answer] ?? STARTERS[0], STARTER_LEVEL, 0, 0);
    });
  },
  SetStarterChoice: (c) => c.writeVar(VAR_PLAYER_STARTER, c.get("arg0")),
  GetStarterChoice: (c) => c.writeVar(c.ptr("var"), c.readVar(VAR_PLAYER_STARTER)),
  HealParty: (c) => c.host.healParty(),
  GetPartyCount: (c) => c.writeVar(c.ptr("var"), c.host.partyCount()),
  GetPartyMonSpecies: (c) => c.writeVar(c.ptr("var"), c.host.partySpecies(c.get("slot"))),
  GetPartyLeadAlive: (c) => c.writeVar(c.ptr("arg0"), c.host.partyLeadAlive()),
  GiveBadge: (c) => c.host.giveBadge(c.get("badge")),
  CheckBadge: (c) => c.writeVar(c.ptr("var"), c.host.hasBadge(c.get("badge")) ? 1 : 0),
};
