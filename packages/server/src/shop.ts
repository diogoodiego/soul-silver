import { buy, sell, sellPrice, stockFor, type PriceInfo, type StockEntry } from "@soulsilver/shared/economy";
import type { ShopRecord } from "@soulsilver/shared/events";
import type { ClientMessage, ServerMessage, ShopRefusal } from "@soulsilver/shared/game";
import { badgeCount, type Save } from "@soulsilver/shared/save";

// Poké Marts (spec 023): one open shop per player, opened by the clerk's script, which waits until
// the player leaves. Every purchase and sale is checked here; a refusal changes nothing.

export interface ShopData {
  shop: (id: number) => ShopRecord | undefined;
  item: (id: number) => PriceInfo | undefined;
}

export function buildShopData(shops: ShopRecord[], items: PriceInfo[]): ShopData {
  const byShop = new Map(shops.map((s) => [s.id, s]));
  const byItem = new Map(items.map((i) => [i.id, i]));
  return { shop: (id) => byShop.get(id), item: (id) => byItem.get(id) };
}

export interface Shopper {
  playerId: number;
  progress: Pick<Save, "money" | "bag" | "badgeSet">;
  send(msg: ServerMessage): void;
}

export interface ShopsOptions {
  data: ShopData;
  /** After a purchase or sale, so the client gets the bag again. */
  changed(playerId: number): void;
  /** The player left the shop: the waiting script goes on. */
  onClose(playerId: number): void;
  log(message: string): void;
}

type ShopRequest = Extract<ClientMessage, { type: "shop-buy" | "shop-sell" | "shop-leave" }>;

interface Open {
  shop: ShopRecord;
  sell: boolean;
}

export interface Shops {
  join(who: Shopper): void;
  leave(playerId: number): void;
  /** False when the shop does not exist; the script then ends. */
  open(playerId: number, shop: number, sell: boolean): boolean;
  handle(playerId: number, msg: ShopRequest): void;
}

export function createShops(options: ShopsOptions): Shops {
  const { data } = options;
  const who = new Map<number, Shopper>();
  const open = new Map<number, Open>();

  const sellable = (w: Shopper): StockEntry[] =>
    w.progress.bag.flatMap(({ item }) => {
      const info = data.item(item);
      const price = info && sellPrice(info);
      return price === undefined ? [] : [{ item, price }];
    });
  const stock = (w: Shopper, o: Open) => (o.sell ? sellable(w) : stockFor(o.shop, badgeCount(w.progress.badgeSet), data.item));
  const show = (w: Shopper, o: Open) => w.send({ type: "shopOpen", shopId: o.shop.id, mode: o.sell ? "sell" : "buy", money: w.progress.money, stock: stock(w, o) });
  const answer = (w: Shopper, reason: ShopRefusal | null) =>
    w.send({ type: "shopResult", ok: reason === null, ...(reason === null ? {} : { reason }), money: w.progress.money });

  return {
    join: (w) => void who.set(w.playerId, w),
    leave(playerId) {
      who.delete(playerId);
      open.delete(playerId);
    },
    open(playerId, id, sell) {
      const w = who.get(playerId);
      const shop = data.shop(id);
      if (!w || !shop) {
        options.log(`Player ${playerId}: shop ${id} does not exist`);
        return false;
      }
      const o = { shop, sell };
      open.set(playerId, o);
      show(w, o);
      return true;
    },
    handle(playerId, msg) {
      const w = who.get(playerId);
      if (!w) return;
      const o = open.get(playerId);
      if (!o) {
        answer(w, "invalid");
        return;
      }
      if (msg.type === "shop-leave") {
        open.delete(playerId);
        w.send({ type: "shopClose" });
        options.onClose(playerId);
        return;
      }
      const refused = msg.type === "shop-buy" ? (o.sell ? "invalid" : buy(w.progress, stock(w, o), msg.item, msg.qty, data.item)) : o.sell ? sell(w.progress, data.item, msg.item, msg.qty) : "invalid";
      answer(w, refused);
      if (refused) return;
      options.changed(playerId);
      if (o.sell) show(w, o);
    },
  };
}
