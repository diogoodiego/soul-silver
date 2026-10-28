import type { Handler } from "../runner.ts";

// The Pokémon Center nurse's common script (spec 023). Most commands only animate the counter, the
// player's avatar or the healing machine; those do nothing here.

const nothing: Handler = () => undefined;

export const CENTER: Record<string, Handler> = {
  // shortcut: trainer card stars are not earned yet, so the nurse never greets a star trainer; count them with the spec that adds the card.
  GetTrcardStars: (c) => c.writeVar(c.ptr("arg0"), 0),
  PartyCountNotEgg: (c) => c.writeVar(c.ptr("var"), c.host.partyCount()),
  // No Pokérus in the remake (yet): the nurse never mentions it.
  PartyHasPokerus: (c) => c.writeVar(c.ptr("arg0"), 0),
  // 0 is on foot; biking and surfing states are not told apart yet.
  GetPlayerState: (c) => c.writeVar(c.ptr("var"), 0),
  // shortcut: the time-of-day greeting is not chosen; 2 makes the script use its plain greeting. Read the clock when a spec needs it.
  ScrCmd_379: (c) => c.writeVar(c.ptr("arg0"), 2),
  // No nicknames: the species name stands in.
  BufferPartyMonNick: (c) => void (c.buffers[c.raw("slot")] = { kind: "species", id: c.host.partySpecies(c.get("party_pos")) }),
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
