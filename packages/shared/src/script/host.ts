// What a running script may ask of the world (spec 020, data-model.md). The runner is pure: every
// effect on the player, the map or the client goes through this interface.
import type { ScriptFile } from "../events/schemas.ts";
import type { CutsceneActor, CutsceneStep } from "../game/protocol.ts";

/** A text buffer the next message fills in; the client turns ids into names. */
export type TextBuffer = { kind: "player" } | { kind: "species"; id: number } | { kind: "number"; value: number } | { kind: "name"; name: string } | { kind: "rival"; name: string } | { kind: "item"; id: number } | { kind: "pocket"; id: number };

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
  | { kind: "cutscene"; actors: CutsceneActor[]; steps: CutsceneStep[] };

/** Things a script shows without waiting. */
export type ScriptEvent =
  | { kind: "close-msg" }
  | { kind: "fade"; type: number; color: number; duration: number }
  | { kind: "sound"; sound: "se" | "fanfare" | "cry"; id: number }
  | { kind: "bgm"; id: number | null }
  /** ResetBGM: the map's music again (spec 024). */
  | { kind: "bgm-reset" }
  /** Building models a script places on the map (spec 024), replacing any before; in map units. */
  | { kind: "props"; props: { model: number; x: number; y: number; z: number }[] };

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
  /** In matrix tiles, as the scripts compare them; facing as SCRIPT_DIRECTIONS indexes. */
  playerPosition(): { x: number; z: number; facing: number };
  warp(map: number, x: number, z: number, facing: number): void;
  /** Turns the object the player talked to towards them, if any. */
  facePlayer(): void;
  hidePerson(id: number): void;
  showPerson(id: number): void;
  /** Undefined when the object is not on the map. */
  personPosition(id: number): { x: number; z: number } | undefined;
  movePerson(id: number, x: number, z: number, facing: number): void;
  /** 0 Sunday to 6 Saturday. */
  weekday(): number;
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
