import { COMMON_MART } from "../../events/schemas.ts";
import type { Handler } from "../runner.ts";

// Poké Mart and PC commands (spec 023): the server runs the shop or the boxes and the script waits
// until they close. Shop ids as shops.json numbers them: the common mart, then special mart n as n + 1.

export const MART: Record<string, Handler> = {
  MartBuy: (c) => c.block({ kind: "shop", shop: COMMON_MART, sell: false }),
  SpecialMartBuy: (c) => c.block({ kind: "shop", shop: c.get("arg0") + 1, sell: false }),
  MartSell: (c) => c.block({ kind: "shop", shop: COMMON_MART, sell: true }),
  // The Pokémon storage; the argument (deposit, withdraw, move) only picks the first screen, one panel does all.
  ScrCmd_158: (c) => c.block({ kind: "pc" }),
  // The PC screen turning on and off, and the overworld coming back after it: nothing to draw here.
  ScrCmd_500: () => undefined,
  ScrCmd_501: () => undefined,
  ScrCmd_502: () => undefined,
  ScrCmd_308: () => undefined,
  ScrCmd_309: () => undefined,
  RestoreOverworld: () => undefined,
};
