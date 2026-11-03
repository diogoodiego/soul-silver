// The commands the walkthrough's path to the Zephyr Badge runs (spec 024, walkthrough.md), after
// pokeheartgold's scrcmd*.c. Those for systems this game does not have yet change nothing, so the
// story goes on; each says which system it waits for.
import { PLAYER_NAME_MAX } from "../../game/limits.ts";
import { formatTextId } from "../../text/ids.ts";
import type { Handler } from "../runner.ts";

const nothing: Handler = () => undefined;

/**
 * Scripted Pokégear calls by "caller:call:arg", with the player-is-male and player-is-female texts (bank 716, Elm's calls).
 * shortcut: only this stretch's call (Elm's on Route 30 after Mr. Pokémon, 227:0), shown as a text box, not the Pokégear's
 * call screen; map the rest from the ROM's phone call table when a spec reaches them.
 */
const SCRIPTED_CALLS: Record<string, [string, string]> = { "1:2:0": ["0716:33", "0716:34"] };
/** VERSION_SOULSILVER (config.h). */
const GAME_VERSION = 8;
/** BufferFriendsName: the friend is the other character. shortcut: the English names; read them from the ROM's text when a language switch exists. */
const FRIEND_NAME = { male: "Lyra", female: "Ethan" } as const;

export const STORY: Record<string, Handler> = {
  // The variable is the screen's noInput: only a nickname sets it, so a rival's name always leaves 0 (launch_application.c).
  NameRival: (c) => {
    const into = c.ptr("arg0");
    c.block({ kind: "name", purpose: "rival" }, (_, text) => {
      c.host.setRivalName((text ?? "").trim().slice(0, PLAYER_NAME_MAX) || c.host.defaultRivalName());
      c.writeVar(into, 0);
    });
  },
  BufferRivalsName: (c) => void (c.buffers[c.raw("slot")] = { kind: "rival", name: c.host.rivalName() || c.host.defaultRivalName() }),
  GetStdMsgNaix: (c) => c.writeVar(c.ptr("arg1"), c.host.stdMessageBank(c.get("arg0"))),
  MsgBoxExtern: (c) => c.block({ kind: "say", text: formatTextId(c.get("arg0"), c.get("arg1")), buffers: { ...c.buffers } }),
  GetItemPocket: (c) => c.writeVar(c.ptr("arg1"), c.host.itemPocket(c.get("arg0"))),
  BufferItemName: (c) => void (c.buffers[c.raw("slot")] = { kind: "item", id: c.get("item") }),
  // shortcut: the singular name; the ROM's plural bank is not extracted yet.
  BufferItemNamePlural: (c) => void (c.buffers[c.raw("arg0")] = { kind: "item", id: c.get("arg1") }),
  BufferPocketName: (c) => void (c.buffers[c.raw("slot")] = { kind: "pocket", id: c.get("pocket") }),
  // The text box waits for the player already; the delay alone never ends it here.
  WaitButtonOrDelay: nothing,
  GetGameVersion: (c) => c.writeVar(c.ptr("arg0"), GAME_VERSION),
  MonGetFriendship: (c) => c.writeVar(c.ptr("arg0"), c.host.partyFriendship(c.get("arg1"))),
  // shortcut: forms are not kept in the party yet; read the member's form when one is.
  GetPartyMonForm2: (c) => c.writeVar(c.ptr("arg1"), 0),
  ScrCmd_729: (c) => c.writeVar(c.ptr("arg0"), c.host.companionOut() ? 1 : 0),
  BufferFriendsName: (c) => void (c.buffers[c.raw("slot")] = { kind: "name", name: FRIEND_NAME[c.host.character] }),
  // shortcut: without the English article ("a CYNDAQUIL"); add it with the text formatter's articles.
  BufferPartyMonSpeciesNameIndef: (c) => void (c.buffers[c.raw("arg0")] = { kind: "species", id: c.host.partySpecies(c.get("arg1")) }),
  // shortcut: the Pokégear has no phone yet, so no number is registered and no call is due; keep them when it does.
  RegisterGearNumber: nothing,
  CheckRegisteredPhoneNumber: (c) => c.writeVar(c.ptr("arg1"), 0),
  GetPhoneBookRematch: (c) => c.writeVar(c.ptr("arg1"), 0),
  UnsetPhoneCallTrigger: nothing,
  // Scripted calls (std 3:39): SetPhoneCall picks the caller and the call, the phone rings, RunPhoneCall plays it.
  SetPhoneCall: (c) => {
    c.phone.call = `${c.get("arg0")}:${c.get("arg1")}:${c.get("arg2")}`;
    if (!SCRIPTED_CALLS[c.phone.call]) c.unsupported();
  },
  RunPhoneCall: (c) => {
    const texts = SCRIPTED_CALLS[c.phone.call ?? ""];
    if (!texts) return c.unsupported();
    c.block({ kind: "say", text: texts[c.host.character === "male" ? 0 : 1], buffers: { 0: { kind: "player" } } });
  },
  RegisterPokegearCard: nothing,
  // Running needs no shoes here and the Pokédex is always open.
  GiveRunningShoes: nothing,
  GivePokedex: nothing,
  // shortcut: blacking out goes to the last Pokémon Center (spec 016); use the script's spawn point when it differs.
  SetSpawn: nothing,
  ScrCmd_582: nothing,
  // Mystery Gift (Save_SysInfo_SetMysteryGiftActive): not in this game.
  ScrCmd_573: nothing,
  // Field camera moves (ov01_021E9AE8, ov01_021E9BB8, ov01_021E9BDC): the camera follows the player.
  ScrCmd_307: nothing,
  ScrCmd_310: nothing,
  ScrCmd_311: nothing,
  // The follower's facing and the wait for its walk (ov01_022055DC, ov01_02205D68): it walks on its own rules.
  ScrCmd_596: (c) => c.writeVar(c.ptr("arg0"), 0),
  ScrCmd_600: nothing,
  // Focus on a point and back (SPRITE_CAMERA_FOCUS): the camera follows the player.
  ScrCmd_102: nothing,
  ScrCmd_103: nothing,
  // shortcut: the friend's catching demonstration (SetupAndStartTutorialBattle) is skipped; the script gives the Poké Balls after it all the same. Stage it when scripted battles can be shown.
  CatchingTutorial: nothing,
  // shortcut: after a scripted loss the script goes on; send the player to the last Pokémon Center (spec 016) when one can be lost.
  WhiteOut: nothing,
  // Violet Gym's lift (InitVioletGym, VioletGymmick_ElevatorAction): its floors are one collision level here, so Falkner is a walk away.
  VioletGymInit: nothing,
  VioletGymElevator: nothing,
  // Script sounds are not played yet (WORLD's PlaySE), so there is nothing to stop.
  StopSE: nothing,
};
