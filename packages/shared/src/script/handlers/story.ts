// The commands the walkthrough's path to the Zephyr Badge runs (spec 024, walkthrough.md), after
// pokeheartgold's scrcmd*.c. Those for systems this game does not have yet change nothing, so the
// story goes on; each says which system it waits for.
import { PLAYER_NAME_MAX } from "../../game/limits.ts";
import { formatTextId } from "../../text/ids.ts";
import type { Handler } from "../runner.ts";
import { SCRIPT_DIRECTIONS } from "../host.ts";
import { initAzaleaGym, rideSpinarak, rideTicks, gymProps, toggleSwitch } from "../../field/azalea-gym.ts";

const nothing: Handler = () => undefined;

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
  // Spec 027: the item-ball and hidden-item std scripts (scr_seq_0141, 0145).
  BufferItemNameIndef: (c) => void (c.buffers[c.raw("arg0")] = { kind: "item", id: c.get("arg1") }),
  BufferTMHMMoveName: (c) => void (c.buffers[c.raw("slot")] = { kind: "move", id: c.host.machineMove?.(c.get("tmhm")) ?? 0 }),
  ItemIsTMOrHM: (c) => c.writeVar(c.ptr("arg1"), (c.host.machineMove?.(c.get("arg0")) ?? 0) > 0 ? 1 : 0),
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
  // The phone (spec 026): numbers and rematches are this player's.
  RegisterGearNumber: (c) => c.host.registerContact(c.get("arg0")),
  CheckRegisteredPhoneNumber: (c) => c.writeVar(c.ptr("arg1"), c.host.isRegistered(c.get("arg0")) ? 1 : 0),
  GetPhoneBookRematch: (c) => c.writeVar(c.ptr("arg1"), c.host.rematch(c.get("arg0"))),
  ScrCmd_462: (c) => c.host.endRematch(c.get("arg0")),
  // shortcut: call triggers (CALL_TRIGGER_*) are not kept yet, as none rings before Violet City; keep them when one does.
  UnsetPhoneCallTrigger: nothing,
  // Scripted calls (std 3:39): SetPhoneCall picks the caller and the call (arg1 2 is "scripted", arg2 the index), RunPhoneCall rings it.
  SetPhoneCall: (c) => {
    const caller = c.get("arg0");
    const script = c.get("arg1") === 2 ? c.host.scriptedCall(caller, c.get("arg2")) : undefined;
    c.phone.call = script === undefined ? undefined : { caller, script };
    if (!c.phone.call) c.unsupported();
  },
  RunPhoneCall: (c) => {
    if (!c.phone.call) return c.unsupported();
    c.block({ kind: "call", ...c.phone.call });
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
  // Spec 030.5: the Azalea Gym's Spinarak and levers (field/azalea-gym.ts). The carts are script props; the server glides the rider.
  AzaleaGymInit: (c) => {
    const gym = c.host.azaleaGym?.();
    if (!gym) return;
    const state = initAzaleaGym(gym);
    c.host.setGymmick?.(state);
    c.host.emit({ kind: "props", props: gymProps(gym, state) });
  },
  AzaleaGymSwitch: (c) => {
    const gym = c.host.azaleaGym?.();
    const state = c.host.gymmick?.();
    if (!gym || !state) return;
    const next = toggleSwitch(state, c.get("arg0"));
    c.host.setGymmick?.(next);
    c.host.emit({ kind: "props", props: gymProps(gym, next) });
  },
  AzaleaGymSpinarak: (c) => {
    const gym = c.host.azaleaGym?.();
    const state = c.host.gymmick?.();
    const ride = gym && state && rideSpinarak(gym, state, c.get("arg0"));
    if (!gym || !ride) return;
    c.host.setGymmick?.(ride.state);
    c.host.ride?.(ride.path, ride.spider);
    c.block({ kind: "wait", ticks: rideTicks(ride.path) }, () => {
      c.host.placePlayer?.(ride.land.x, ride.land.z, SCRIPT_DIRECTIONS.indexOf(ride.facing));
      c.host.emit({ kind: "props", props: gymProps(gym, ride.state) });
    });
  },
  // Item 030.10. Code overlays (the bug contest's among them): nothing to load here.
  ScriptOverlayCmd: nothing,
  // shortcut: the Bug-Catching Contest is not in the game yet (Marco 6), so no one is registered; ask the contest when it exists.
  IsBugContestantRegistered: (c) => c.writeVar(c.ptr("arg1"), 0),
  // Field_GetHour, for the Goldenrod rematch calls.
  ScrCmd_522: (c) => c.writeVar(c.ptr("arg0"), c.host.hour()),
  // shortcut: no Pokémon in this game comes from an event, so none has a fateful encounter; read it from the member when events give one.
  GetPartySlotWithFatefulEncounter: (c) => c.writeVar(c.ptr("arg0"), 255),
  // shortcut: Celebi's time-travel scene (only after the GS Ball event) is not drawn; the script fades and warps on its own.
  ScrCmd_810: nothing,
  // Script sounds are not played yet (WORLD's PlaySE), so there is nothing to stop.
  StopSE: nothing,
  // Item 031.1. A beast's cry animation (always between Release and Lock, after PlayCry): looks the client does not draw.
  ScrCmd_523: nothing,
  // Item 031.2: Raikou (0) and Entei (1) start roaming for this player (wild/roamer.ts).
  CreateRoamer: (c) => c.host.createRoamer?.(c.get("arg0")),
};
