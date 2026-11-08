import type { Handler } from "../runner.ts";

// The Pokémon Center nurse's common script (spec 023). Most commands only animate the counter, the
// player's avatar or the healing machine; those do nothing here.

const nothing: Handler = () => undefined;
// gf_rtc.c sTimeOfDayByHour; include/gf_rtc.h: MORN 0, DAY 1, EVE 2, NITE 3, LATE 4.
const RTC_TIME_OF_DAY = [4, 4, 4, 4, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3];

export const CENTER: Record<string, Handler> = {
  // shortcut: trainer card stars are not earned yet, so the nurse never greets a star trainer; count them with the spec that adds the card.
  GetTrcardStars: (c) => c.writeVar(c.ptr("arg0"), 0),
  PartyCountNotEgg: (c) => c.writeVar(c.ptr("var"), c.host.partyCount()),
  // No Pokérus in the remake (yet): the nurse never mentions it.
  PartyHasPokerus: (c) => c.writeVar(c.ptr("arg0"), 0),
  // Bad eggs (a corrupted save's) cannot exist here: the party is always legal and the nurse heals (spec 024).
  PartyLegalCheck: (c) => c.writeVar(c.ptr("arg0"), 0),
  // 0 is on foot; biking and surfing states are not told apart yet.
  GetPlayerState: (c) => c.writeVar(c.ptr("var"), 0),
  // GetTimeOfDay (Field_GetTimeOfDay): the RTC band of the session hour (spec 026).
  ScrCmd_379: (c) => c.writeVar(c.ptr("arg0"), RTC_TIME_OF_DAY[c.host.hour()] ?? 1),
  // No nicknames: the species name stands in.
  BufferPartyMonNick: (c) => {
    const slot = c.get("party_pos");
    const nickname = c.host.partyNickname(slot);
    c.buffers[c.raw("slot")] = nickname ? { kind: "name", name: nickname } : { kind: "species", id: c.host.partySpecies(slot) };
  },
  // The command table calls the argument a text; the scripts pass the variable that holds its index.
  NonNPCMsgVar: (c) => {
    const arg = c.args["msg_id"];
    const text = typeof arg === "object" && "text" in arg ? arg.text : c.text(c.get("msg_id"));
    c.block({ kind: "say", text, buffers: { ...c.buffers } });
  },
  DebugWatch: nothing,
  SetAvatarBits: nothing,
  UpdateAvatarState: nothing,
  PokeCenAnim: nothing,
  ScrCmd_436: nothing,
  ScrCmd_599: nothing,
};
