import { formatTextId } from "../../text/index.ts";
import type { Handler } from "../runner.ts";

// Item 030.10: the Ilex Forest Headbutt tutor (scr_seq 92) and its shrine, after pokeheartgold
// scrcmd_party.c, scrcmd_move_tutor.c, scrcmd_strbuf.c, scrcmd_c.c and scrcmd_pokemon_misc.c.

const NONE = 255;
const PARTY_SIZE = 6;
/** GetMoveSelection when no move is forgotten. */
const KEEP_MOVES = 4;
/** MOVE_TUTOR_NPC_HEADBUTT: the tutors.json area of the Ilex Forest tutor. */
const HEADBUTT_TUTOR = 3;
/** Move names (msgdata bank 750). */
const MOVE_NAMES_BANK = 750;
const PICHU = 172;
const ITEM_ZAP_PLATE = 300;
/** sSpikyEarPichuMoveset: Helping Hand, Volt Tackle, Swagger, Pain Split. */
const SPIKY_EAR_PICHU_MOVES = [270, 344, 207, 220];

export const TUTOR: Record<string, Handler> = {
  // The party menu; GetPartySelection reads the slot, 255 for B (the menu's 7).
  PartySelectUI: (c) => c.block({ kind: "party" }, (slot) => (c.party.picked = slot < PARTY_SIZE ? slot : NONE)),
  GetPartySelection: (c) => c.writeVar(c.ptr("arg0"), c.party.picked),
  MonHasMove: (c) => {
    const slot = c.get("arg2");
    c.writeVar(c.ptr("arg0"), !c.host.partyIsEgg?.(slot) && (c.host.partyMoves?.(slot) ?? []).includes(c.get("arg1")) ? 1 : 0);
  },
  CountMonMoves: (c) => {
    const slot = c.get("arg1");
    c.writeVar(c.ptr("arg0"), c.host.partyIsEgg?.(slot) ? 0 : (c.host.partyMoves?.(slot) ?? []).filter((m) => m !== 0).length);
  },
  // GetLearnableTutorMoves for the Headbutt tutor: a move it teaches that the member does not know yet.
  ScrCmd_656: (c) => {
    const slot = c.get("arg0");
    const known = c.host.partyMoves?.(slot) ?? [];
    c.writeVar(c.ptr("arg1"), (c.host.tutorMoves?.(slot, HEADBUTT_TUTOR) ?? []).some((m) => !known.includes(m)) ? 1 : 0);
  },
  // shortcut: the forget-a-move screen is the script menu (the moves known, then the new one); draw the summary panel when the party screen gets one.
  PokemonSummaryScreen: (c) => {
    const known = c.host.partyMoves?.(c.get("arg1")) ?? [];
    const items = [...known, c.get("arg2")].map((m) => formatTextId(MOVE_NAMES_BANK, m));
    c.block({ kind: "menu", items, cancel: true, buffers: {} }, (answer) => (c.party.move = answer < known.length ? answer : KEEP_MOVES));
  },
  GetMoveSelection: (c) => c.writeVar(c.ptr("arg1"), c.party.move),
  BufferPartyMonMoveName: (c) => {
    const move = c.host.partyMoves?.(c.get("party_pos"))[c.get("move_pos")];
    if (move !== undefined) c.buffers[c.raw("slot")] = { kind: "move", id: move };
  },
  SetMonMove: (c) => c.host.setPartyMove?.(c.get("arg0"), c.get("arg1"), c.get("arg2")),
  // The shrine's Pichu, only reached with the event Pichu in the party (none exists in this game).
  // shortcut: the save keeps no form, nature or gender choice, so it is a plain Pichu; keep them when the save gets forms.
  GiveSpikyEarPichu: (c) => {
    const slot = c.host.partyCount();
    if (slot >= PARTY_SIZE || !c.host.giveMon(PICHU, 30, ITEM_ZAP_PLATE, 1)) return;
    SPIKY_EAR_PICHU_MOVES.forEach((move, i) => c.host.setPartyMove?.(slot, i, move));
  },
};
