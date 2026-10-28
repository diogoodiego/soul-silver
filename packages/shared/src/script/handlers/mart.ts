import { COMMON_MART } from "../../events/schemas.ts";
import type { Handler } from "../runner.ts";

// Poké Mart commands (spec 023): the server runs the shop and the script waits until it closes.
// Shop ids as shops.json numbers them: the common mart, then special mart n as n + 1.

export const MART: Record<string, Handler> = {
  MartBuy: (c) => c.block({ kind: "shop", shop: COMMON_MART, sell: false }),
  SpecialMartBuy: (c) => c.block({ kind: "shop", shop: c.get("arg0") + 1, sell: false }),
  MartSell: (c) => c.block({ kind: "shop", shop: COMMON_MART, sell: true }),
};
