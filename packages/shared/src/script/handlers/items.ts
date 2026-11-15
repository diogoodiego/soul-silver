import type { Handler } from "../runner.ts";

const answer = (ok: boolean) => (ok ? 1 : 0);
const RED_APRICORN = 485;
const APRICORN_COLOURS = 7;

export const ITEMS: Record<string, Handler> = {
  GiveItem: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.giveItem(c.get("arg0"), c.get("arg1")))),
  TakeItem: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.takeItem(c.get("arg0"), c.get("arg1")))),
  HasItem: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.hasItem(c.get("arg0"), c.get("arg1")))),
  GetItemQuantity: (c) => c.writeVar(c.ptr("arg1"), c.host.itemCount(c.get("arg0"))),
  HasSpaceForItem: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.hasSpaceForItem(c.get("arg0"), c.get("arg1")))),
  AddMoney: (c) => c.host.addMoney(c.raw("arg0")),
  SubMoneyImmediate: (c) => c.host.addMoney(-c.raw("arg0")),
  HasEnoughMoneyImmediate: (c) => c.writeVar(c.ptr("arg0"), answer(c.host.money() >= c.raw("arg1"))),
  // Spec 027: apricorn trees (scr_seq_0150) and Kurt (scr_seq_0874). Red Apricorn is item 485, the other colours follow.
  AnimApricornTree: (c) => c.writeVar(c.ptr("arg0"), answer(c.host.apricornTree?.()?.ready ?? false)),
  ApricornTreeGetApricorn: (c) => c.writeVar(c.ptr("arg0"), c.host.apricornTree?.()?.color ?? 0),
  GiveApricornFromTree: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.pickApricorn?.() ?? false)),
  BufferApricornName: (c) => void (c.buffers[c.raw("arg0")] = { kind: "item", id: RED_APRICORN + c.get("arg1") }),
  GetTotalApricornCount: (c) => c.writeVar(c.ptr("arg0"), (c.host.apricorns?.() ?? []).reduce((a, b) => a + b, 0)),
  ScrCmd_735: (c) => c.writeVar(c.ptr("arg0"), c.host.kurtCount?.() ?? 0),
  ScrCmd_737: (c) => c.writeVar(c.ptr("arg0"), c.host.kurtBall?.() ?? 0),
  ScrCmd_739: (c) => c.block({ kind: "apricorn", counts: c.host.apricorns?.() ?? [0, 0, 0, 0, 0, 0, 0] }, (color) => color < APRICORN_COLOURS && c.host.giveKurt?.(color)),
  ClearKurtApricorn: (c) => c.host.clearKurt?.(),
};
