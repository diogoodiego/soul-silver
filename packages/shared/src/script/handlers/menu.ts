import { formatTextId } from "../../text/index.ts";
import type { CommandContext, Handler } from "../runner.ts";

// Choice menus (spec 023): MenuInit… opens a list, MenuItemAdd fills it, MenuExec asks the client and
// writes the value of the item picked. MenuInitStdGmm takes its texts from the standard bank.

/** The standard menu texts (BUY, SELL, SEE YA!...). */
const STD_MENU_BANK = 191;
/** What MenuExec writes when the player backs out. */
const MENU_CANCEL = 0xfffe;

const init = (std: boolean) => (c: CommandContext) => {
  c.menu.into = c.raw("arg4");
  c.menu.cancel = c.raw("arg3") === 1;
  c.menu.items = [];
  c.menu.std = std;
};

export const MENU: Record<string, Handler> = {
  MenuInit: init(false),
  MenuInitStdGmm: init(true),
  MenuItemAdd: (c) => {
    const index = c.get("arg0");
    c.menu.items.push({ text: c.menu.std ? formatTextId(STD_MENU_BANK, index) : c.text(index), value: c.get("arg2") });
  },
  MenuExec: (c) => {
    const { into, items } = c.menu;
    c.block({ kind: "menu", items: items.map((i) => i.text), cancel: c.menu.cancel, buffers: { ...c.buffers } }, (answer) => c.writeVar(into, items[answer]?.value ?? MENU_CANCEL));
  },
};
