import type { Handler } from "../runner.ts";

const answer = (ok: boolean) => (ok ? 1 : 0);

export const ITEMS: Record<string, Handler> = {
  GiveItem: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.giveItem(c.get("arg0"), c.get("arg1")))),
  TakeItem: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.takeItem(c.get("arg0"), c.get("arg1")))),
  HasItem: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.hasItem(c.get("arg0"), c.get("arg1")))),
  HasSpaceForItem: (c) => c.writeVar(c.ptr("arg2"), answer(c.host.hasSpaceForItem(c.get("arg0"), c.get("arg1")))),
  AddMoney: (c) => c.host.addMoney(c.raw("arg0")),
  SubMoneyImmediate: (c) => c.host.addMoney(-c.raw("arg0")),
  HasEnoughMoneyImmediate: (c) => c.writeVar(c.ptr("arg0"), answer(c.host.money() >= c.raw("arg1"))),
};
