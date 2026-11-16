import type { Handler } from "../runner.ts";

// Item 030.10: in-game trades (Violet, Goldenrod) and Kenya's loan on Route 35, after pokeheartgold
// scrcmd_c.c, npc_trade.c and scrcmd_party.c. The trades themselves are npc-trades.json.

const NONE = 255;
const PARTY_SIZE = 6;
/** NPC_TRADE_KENYA_SPEAROW. */
const KENYA = 7;

export const TRADE: Record<string, Handler> = {
  // The party menu for a trade; GetPartySelection reads the slot.
  ScrCmd_566: (c) => c.block({ kind: "party" }, (slot) => (c.party.picked = slot < PARTY_SIZE ? slot : NONE)),
  LoadNPCTrade: (c) => (c.npcTrade.id = c.raw("arg0")),
  NPCTradeGetReqSpecies: (c) => {
    const id = c.npcTrade.id;
    c.writeVar(c.ptr("arg0"), id === undefined ? 0 : (c.host.npcTrade?.(id)?.ask ?? 0));
  },
  // shortcut: the trade animation is not drawn; the member is swapped at once. Play it when the trade screen exists.
  NPCTradeExec: (c) => {
    const id = c.npcTrade.id;
    if (id !== undefined) c.host.tradeMon?.(id, c.get("arg0"));
  },
  NPCTradeEnd: (c) => (c.npcTrade.id = undefined),
  // NPCTrade_MakeAndGiveLoanMon: only Kenya carries mail. arg2 is the map it was met on, which the save does not keep.
  GiveLoanMon: (c) => {
    const id = c.raw("arg0");
    c.host.giveLoanMon?.(id, c.raw("arg1"), id === KENYA);
  },
  KenyaCheckPartyOrMailbox: (c) => c.writeVar(c.ptr("arg0"), c.host.hasTradeMail?.(KENYA) ? 1 : 0),
};
