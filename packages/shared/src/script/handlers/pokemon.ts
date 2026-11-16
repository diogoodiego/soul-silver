import { STARTER_LEVEL, STARTERS } from "../../progression/starter.ts";
import { BOX_COUNT, BOX_SLOTS } from "../../save/schema.ts";
import type { Handler } from "../runner.ts";

/** VAR_PLAYER_STARTER (vars.h), where SetStarterChoice keeps the species. */
const VAR_PLAYER_STARTER = 0x4030;
const TOGEPI = 175;
const EXTRASENSORY = 326;

export const POKEMON: Record<string, Handler> = {
  // Spec 029.5: gift eggs, made and hatched like the Day Care's; arg1 is where it was received, which the save does not keep.
  GiveEgg: (c) => c.host.giveEgg?.(c.get("arg0")),
  GiveTogepiEgg: (c) => c.host.giveEgg?.(TOGEPI, EXTRASENSORY),
  GiveMon: (c) => c.writeVar(c.ptr("retvar"), c.host.giveMon(c.get("species"), c.get("level"), c.get("heldItem"), c.get("form")) ? 1 : 0),
  ChooseStarter: (c) => {
    c.block({ kind: "starter", species: [...STARTERS] }, (answer) => {
      c.host.giveMon(STARTERS[answer] ?? STARTERS[0], STARTER_LEVEL, 0, 0);
    });
  },
  NicknameInput: (c) => {
    const slot = c.get("arg0");
    // shortcut: the bug contest's catch (slot 255) is not named; it has no party slot until the contest exists.
    c.block({ kind: "name", purpose: "nickname", species: c.host.partySpecies(slot) }, (_, text) => c.host.nicknamePartyMon(slot, text ?? ""));
  },
  SetStarterChoice: (c) => c.writeVar(VAR_PLAYER_STARTER, c.get("arg0")),
  GetStarterChoice: (c) => c.writeVar(c.ptr("var"), c.readVar(VAR_PLAYER_STARTER)),
  HealParty: (c) => c.host.healParty(),
  GetPartyCount: (c) => c.writeVar(c.ptr("var"), c.host.partyCount()),
  // Item 031.7: free PC box slots (the Cianwood Tentacool goes only to a player with an empty PC, 540).
  CountPCEmptySpace: (c) => c.writeVar(c.ptr("arg0"), BOX_COUNT * BOX_SLOTS - (c.host.boxMonCount?.() ?? 0)),
  // An egg reads as species 0 (spec 029.2), as the Day Care script expects.
  GetPartyMonSpecies: (c) => c.writeVar(c.ptr("var"), c.host.partyIsEgg?.(c.get("slot")) ? 0 : c.host.partySpecies(c.get("slot"))),
  GetPartyLeadAlive: (c) => c.writeVar(c.ptr("arg0"), c.host.partyLeadAlive()),
  // Spec 030.2: a host without ribbons or an album reads none given and a full album, so the scripts give and take nothing.
  MonHasRibbon: (c) => c.writeVar(c.ptr("arg0"), c.host.monHasRibbon?.(c.get("arg1"), c.get("arg2")) ? 1 : 0),
  GiveRibbon: (c) => c.host.giveRibbon?.(c.get("arg0"), c.get("arg1")),
  PhotoAlbumIsFull: (c) => c.writeVar(c.ptr("arg0"), (c.host.photoAlbumFull?.() ?? true) ? 1 : 0),
  // shortcut: the photo is kept, but the client shows no photo screen nor album; add them with the Photo Album item.
  CameronPhoto: (c) => c.host.takePhoto?.(c.get("arg0")),
  // Spec 030.3, the Ruins Research Center: Unown forms recorded (28 with ! and ?), and all 26 letters.
  ScrCmd_545: (c) => c.writeVar(c.ptr("arg0"), c.host.unownForms?.() ?? 0),
  CheckSeenAllLetterUnown: (c) => c.writeVar(c.ptr("arg0"), (c.host.unownForms?.() ?? 0) >= 26 ? 1 : 0),
  GiveBadge: (c) => c.host.giveBadge(c.get("badge")),
  CheckBadge: (c) => c.writeVar(c.ptr("var"), c.host.hasBadge(c.get("badge")) ? 1 : 0),
};
