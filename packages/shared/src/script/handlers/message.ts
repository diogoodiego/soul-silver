import type { CommandContext, Handler } from "../runner.ts";

// A message waits until the player confirmed it, so the waits that follow one in the original
// (WaitButton, WaitABPress, WaitSignpost) have nothing left to wait for (research.md R2).

const say = (c: CommandContext, text: string) => c.block({ kind: "say", text, buffers: { ...c.buffers } });
const textArg = (c: CommandContext, arg: string) => {
  const v = c.args[arg];
  return typeof v === "object" && "text" in v ? v.text : c.text(c.raw(arg));
};
const nothing: Handler = () => undefined;

export const MESSAGE: Record<string, Handler> = {
  NPCMsg: (c) => say(c, textArg(c, "msg_id")),
  NonNPCMsg: (c) => say(c, textArg(c, "msg_id")),
  // Name and gender come from the save made at new game (FR-009).
  GenderMsgBox: (c) => say(c, c.text(c.raw(c.host.character === "male" ? "arg0" : "arg1"))),
  WaitButton: nothing,
  WaitABPress: nothing,
  WaitButtonOrDpad: nothing,
  HoldMsg: nothing,
  CloseMsg: (c) => c.host.emit({ kind: "close-msg" }),
  YesNo: (c) => {
    const into = c.ptr("arg0");
    c.block({ kind: "yes-no" }, (answer) => c.writeVar(into, answer === 0 ? 0 : 1));
  },
  // On the touch screen after a question; the answer is the same 0 yes / 1 no.
  GetMenuChoice: (c) => {
    const into = c.ptr("arg0");
    c.block({ kind: "yes-no" }, (answer) => c.writeVar(into, answer === 0 ? 0 : 1));
  },
  TouchscreenMenuShow: nothing,
  TouchscreenMenuHide: nothing,
  BufferPlayersName: (c) => void (c.buffers[c.raw("slot")] = { kind: "player" }),
  BufferSpeciesName: (c) => void (c.buffers[c.raw("slot")] = { kind: "species", id: c.get("species") }),
  BufferMonSpeciesName: (c) => void (c.buffers[c.raw("slot")] = { kind: "species", id: c.host.partySpecies(c.get("party_pos")) }),
  GetPlayerGender: (c) => c.writeVar(c.ptr("var"), c.host.character === "male" ? 0 : 1),
  SetSignpostMap: nothing,
  SetSignpostAction: nothing,
  WaitSignpostAction: nothing,
  DirectionSignpost: (c) => say(c, textArg(c, "message")),
  TrainerTips: (c) => say(c, textArg(c, "message")),
  // 0 is "closed with A or B"; walking off the sign is not told apart.
  WaitSignpost: (c) => c.writeVar(c.ptr("out"), 0),
};
