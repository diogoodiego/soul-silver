// What a running script may ask of the world (spec 020, data-model.md). The runner is pure: every
// effect on the player, the map or the client goes through this interface.
import type { ScriptFile } from "../events/schemas.ts";
import type { CutsceneActor, CutsceneStep } from "../game/protocol.ts";
import type { AzaleaGym, AzaleaGymState, GymTile } from "../field/azalea-gym.ts";

/** A text buffer the next message fills in; the client turns ids into names. */
export type TextBuffer = { kind: "player" } | { kind: "species"; id: number } | { kind: "number"; value: number } | { kind: "name"; name: string } | { kind: "rival"; name: string } | { kind: "item"; id: number } | { kind: "pocket"; id: number } | { kind: "place"; mapsec: number } | { kind: "text"; text: string } | { kind: "move"; id: number };

/** What a blocked script waits for. `answer` on resume: 0 yes / 1 no, or the index picked. */
export type ScriptRequest =
  /** `text` is a text id ("bank:index"); the client answers once the player confirmed it. */
  | { kind: "say"; text: string; buffers: Record<number, TextBuffer> }
  | { kind: "yes-no" }
  /** The starter scene: the client answers the index of the species picked. */
  | { kind: "starter"; species: number[] }
  /** A naming screen; answered with the text typed. Spec 024: the rival, or the party member of `species`. */
  | { kind: "name"; purpose: "rival" } | { kind: "name"; purpose: "nickname"; species: number }
  /** Wait for the fade, sound effect, fanfare or cry started earlier to finish. */
  | { kind: "wait-fade" }
  | { kind: "wait-sound"; sound: "se" | "fanfare" | "cry" }
  /** Counted by the server, no client involved. */
  | { kind: "wait"; ticks: number }
  /** Spec 022: a trainer battle, run by the server; `partner` is the second trainer of a tag battle, 0 for none. */
  | { kind: "battle"; trainer: number; partner: number }
  /** Spec 023: a choice list after the last message; the answer is the index picked, past the end to cancel. */
  | { kind: "menu"; items: string[]; cancel: boolean; buffers: Record<number, TextBuffer> }
  /** Spec 023: the Pokémon storage, run by the server. */
  | { kind: "pc" }
  /** Spec 023: a Poké Mart run by the server; `shop` is a shops.json id. */
  | { kind: "shop"; shop: number; sell: boolean }
  /** Spec 021: the triggering client stages these steps and answers when they end. */
  | { kind: "cutscene"; actors: CutsceneActor[]; steps: CutsceneStep[] }
  /** Spec 026: a call the script places rings on the Pokégear; answered once the player hangs up. */
  | { kind: "call"; caller: number; script: number }
  /** Spec 027: Kurt asks for an apricorn colour from the box (ScrCmd_739); answered with the colour, 7 to cancel. */
  | { kind: "apricorn"; counts: number[] }
  /** Spec 029: pick a party member (ScrCmd_551, the Day Care); answered with the slot, past the party to cancel. */
  | { kind: "party" }
  /** Spec 029.4: the hatch animation for the species that hatched (EggHatchAnim); answered when it ends. */
  | { kind: "hatch"; species: number };

/** Spec 029: a Pokémon at the Day Care as the player would take it back now. */
export interface DaycareView {
  species: number;
  nickname?: string | undefined;
  /** The level with the steps walked as experience. */
  level: number;
  gained: number;
  /** Undefined when the species has both genders or none: the save does not keep which one a member is. */
  gender: "male" | "female" | undefined;
}

/** Things a script shows without waiting. */
export type ScriptEvent =
  | { kind: "close-msg" }
  | { kind: "fade"; type: number; color: number; duration: number }
  | { kind: "sound"; sound: "se" | "fanfare" | "cry"; id: number }
  | { kind: "bgm"; id: number | null }
  /** ResetBGM: the map's music again (spec 024). */
  | { kind: "bgm-reset" }
  /** Building models a script places on the map (spec 024), replacing any before; in map units. */
  | { kind: "props"; props: { model: number; x: number; y: number; z: number; pose?: number }[] };

/** Directions as the game numbers them. */
export const SCRIPT_DIRECTIONS = ["north", "south", "west", "east"] as const;

export interface ScriptHost {
  flag(id: number): boolean;
  setFlag(id: number, on: boolean): void;
  /** Saved variables (0x4000 to 0x7FFF); absent ones hold 0. */
  getVar(id: number): number;
  setVar(id: number, value: number): void;
  readonly character: "male" | "female";
  money(): number;
  /** Clamped to the wallet's range by the host. */
  addMoney(amount: number): void;
  /** Each returns false and changes nothing when it cannot. */
  giveItem(item: number, count: number): boolean;
  takeItem(item: number, count: number): boolean;
  hasItem(item: number, count: number): boolean;
  hasSpaceForItem(item: number, count: number): boolean;
  partyCount(): number;
  /** 0 past the end of the party. */
  partySpecies(slot: number): number;
  /** First party slot with HP left; the party size when none. */
  partyLeadAlive(): number;
  /** False when the party and every PC box are full. */
  giveMon(species: number, level: number, item: number, form: number): boolean;
  /** Spec 024: an empty name clears the nickname, so the species' name shows. */
  nicknamePartyMon(slot: number, name: string): void;
  partyNickname(slot: number): string | undefined;
  /** 0 past the end of the party. */
  partyFriendship(slot: number): number;
  /** Spec 024: the save's rival name; empty until NameRival. */
  rivalName(): string;
  setRivalName(name: string): void;
  /** The name the rival takes when nothing is typed, from the game's text. */
  defaultRivalName(): string;
  /** Whether a Pokémon follows the player now (spec 014): false with the lead in its ball. */
  companionOut(): boolean;
  /** GetStdMsgNaix: the extracted ov01_022067C8 table (std-messages.json); 0 past its end. */
  stdMessageBank(index: number): number;
  /** The bag pocket of an item, as POCKET_KEYS indexes (ITEMATTR_FIELD_POCKET); 0 when unknown. */
  itemPocket(item: number): number;
  healParty(): void;
  /** Defeated-trainer flags, by trainer id (spec 022). */
  trainerFlag(trainer: number): boolean;
  setTrainerFlag(trainer: number, on: boolean): void;
  /** Whether the player won the last trainer battle. */
  battleWon(): boolean;
  hasBadge(badge: number): boolean;
  giveBadge(badge: number): void;
  /** Spec 025: who uses a field move (the companion when it knows it); the party size when no one does. */
  partySlotWithMove(move: number): number;
  /** Strength is on for this visit of the map: boulders move when walked into. */
  strength(): boolean;
  setStrength(on: boolean): void;
  /** Rolls the map's rock smash or headbutt table for the obstacle ahead; true when a wild Pokémon came out. */
  fieldEncounter(kind: "rockSmash" | "headbutt"): boolean;
  /** An item in the smashed rock (rock_smash_item.c): its id, or 0 for none. */
  rockSmashItem(): number;
  /** The walk across the rock wall, waterfall or whirlpool ahead; undefined when there is none. */
  crossing(kind: "rockClimb" | "waterfall" | "whirlpool"): { dir: "north" | "south" | "west" | "east"; count: number } | undefined;
  /** In matrix tiles, as the scripts compare them; facing as SCRIPT_DIRECTIONS indexes. */
  playerPosition(): { x: number; z: number; facing: number };
  warp(map: number, x: number, z: number, facing: number): void;
  /** Spec 030.5: moves the player on this map, in its own tiles, without it counting as a step onto a trigger. */
  placePlayer?(x: number, z: number, facing: number): void;
  /** Spec 030.5: the Azalea Gym's threads (azalea-gym.json); undefined without the file. */
  azaleaGym?(): AzaleaGym | undefined;
  /** Spec 030.5: this player's Azalea Gym spiders and levers (the original's Gymmick block), set on entering the gym. */
  gymmick?(): AzaleaGymState | undefined;
  setGymmick?(state: AzaleaGymState): void;
  /** Spec 030.5: glides the player along `path` (map tiles) on spider `spider` while the script waits out the ride. */
  ride?(path: GymTile[], spider: number): void;
  /** Turns the object the player talked to towards them, if any. */
  facePlayer(): void;
  hidePerson(id: number): void;
  showPerson(id: number): void;
  /** Undefined when the object is not on the map. */
  personPosition(id: number): { x: number; z: number } | undefined;
  movePerson(id: number, x: number, z: number, facing: number): void;
  /** 0 Sunday to 6 Saturday. */
  weekday(): number;
  /** The session hour, 0 to 23. */
  hour(): number;
  /** Spec 026: this player's phone book (RegisterGearNumber, CheckRegisteredPhoneNumber). */
  registerContact(id: number): void;
  isRegistered(id: number): boolean;
  /** GetPhoneBookRematch: the rematch trainer while the contact seeks one, else 0. */
  rematch(id: number): number;
  /** ScrCmd_462: the rematch was fought; the contact stops seeking it. */
  endRematch(id: number): void;
  /** The PHONE_SCRIPT of a scripted call (SetPhoneCall with isScriptedCall 2), by caller and index; undefined when unknown. */
  scriptedCall(caller: number, index: number): number | undefined;
  /** Spec 027: the move a TM or HM item teaches; 0 for any other item. */
  machineMove?(item: number): number;
  /** Spec 027: the apricorn tree talked to (its object's param 0): its colour and whether it bears one today. */
  apricornTree?(): { color: number; ready: boolean } | undefined;
  /** Picks the tree talked to into the Apricorn Box; false when there is nothing to pick or the box is full. */
  pickApricorn?(): boolean;
  /** The Apricorn Box: how many of each colour. */
  apricorns?(): number[];
  /** Kurt takes every apricorn of `color` from the box, to make into balls by tomorrow (ScrCmd_739). */
  giveKurt?(color: number): void;
  /** What Kurt holds: how many apricorns (ScrCmd_735) and the ball they make (ScrCmd_737); 0 for none. */
  kurtCount?(): number;
  kurtBall?(): number;
  clearKurt?(): void;
  /** Spec 029: the Day Care, slot 0 first. */
  daycare?(): DaycareView[];
  /** Leaves the party member at the Day Care (Save_Daycare_PutMonIn). */
  daycareDeposit?(slot: number): void;
  /** Takes a Pokémon back to the end of the party, grown (Save_Daycare_RetrieveMon); its species. */
  daycareRetrieve?(index: number): number;
  /** Party members with HP left, not counting `except` (CountAliveMons). */
  aliveMons?(except?: number): number;
  /** Pokémon in all the PC boxes (PCStorage_CountMonsInAllBoxes). */
  boxMonCount?(): number;
  /** Spec 029.2: the man holds an egg (Save_Daycare_HasEgg). */
  daycareEgg?(): boolean;
  /** Save_Daycare_CalcCompatibility: 0 best to 3 incompatible. */
  daycareCompatibility?(): number;
  /** GiveEggToPlayer: the egg to the end of the party, and the man no longer holds one. */
  giveDaycareEgg?(): void;
  /** Save_Daycare_ResetEggStats: the player turned the egg down. */
  resetDaycareEgg?(): void;
  /** Whether the party member is an egg. */
  partyIsEgg?(slot: number): boolean;
  /** Spec 029.4, EggHatchAnim: the first egg at 0 cycles hatches (Party_GetMonToHatch); its species, or none. */
  hatchEgg?(): number | undefined;
  /** Spec 029.5, ScrCmd_GiveEgg and ScrCmd_GiveTogepiEgg: a gift egg of `species` (with `move` added) when the party has room. */
  giveEgg?(species: number, move?: number): void;
  /** Spec 030.2, MonHasRibbon and GiveRibbon: a party member's ribbons. */
  monHasRibbon?(slot: number, ribbon: number): boolean;
  giveRibbon?(slot: number, ribbon: number): void;
  /** Spec 030.2, PhotoAlbumIsFull and CameronPhoto: the photo album, and a photo of the party at `spot`. */
  photoAlbumFull?(): boolean;
  takePhoto?(spot: number): void;
  /** Spec 030.3, PlayerOnBikeCheck: the player rides the bike. */
  onBike?(): boolean;
  /** Spec 030.3, ScrCmd_545 and CheckSeenAllLetterUnown: how many Unown forms the Pokédex holds. */
  unownForms?(): number;
  /** A uniform u16 from the simulation's seeded generator (LCRandom in the original). */
  random16(): number;
  emit(event: ScriptEvent): void;
  /**
   * Commands owned by later specs (movement and camera, battles, marts, PC). Returns false when
   * nothing implements it yet, which ends the script as a missing command.
   */
  bridge(command: string, args: Record<string, unknown>): boolean;
  /** Script file by id, and where a global script id leads (CallStd). */
  file(id: number): ScriptFile | undefined;
  resolve(scriptId: number): { file: number; entry: number } | undefined;
}
