<script lang="ts">
  // Poké Mart (spec 023, US1) on the shop totem, the Pokédex model in blue. Each row counts how many go in the cart
  // (confirm adds one, left/right step it); the summary shows the total and the balance after it; the primary button
  // sends every line. The server decides; a refusal comes back as `refused`. The tabs (Q/E, LB/RB) buy or sell.
  import type { Action } from "@soulsilver/shared/input";
  import { onMount, tick } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import type { ServerMessage } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import { DEX_SCREEN_H, DEX_SCREEN_W, mountPokedex } from "../render/pokedex-model";
  import { settings } from "../settings";
  import Button from "../ui/Button.svelte";
  import DexCounterRow from "../ui/DexCounterRow.svelte";
  import { cartMax, cartTotal } from "./shop-cart";
  import DexTabs from "../ui/DexTabs.svelte";

  let {
    shop,
    bag,
    refused,
    itemName,
    onConfirm,
    onMode,
    onLeave,
  }: {
    shop: Extract<ServerMessage, { type: "shopOpen" }>;
    bag: { item: number; count: number }[];
    refused: string | undefined;
    itemName: (id: number) => string;
    onConfirm: (item: number, qty: number) => void;
    onMode: (mode: "buy" | "sell") => void;
    onLeave: () => void;
  } = $props();

  /** The totem's shell: Poké Mart blue. */
  const MART_BLUE = 0x1f5fbf;
  let host: HTMLElement;
  let screen: HTMLDivElement;
  let setDither = $state<(on: boolean) => void>();
  onMount(() => {
    const dex = mountPokedex(host, screen, "raised", undefined, MART_BLUE);
    setDither = dex.setDither;
    return dex.dispose;
  });
  $effect(() => setDither?.($settings.dither));

  const TABS = [
    { id: "buy", label: t("shop.buyTitle") },
    { id: "sell", label: t("shop.sellTitle") },
  ] as const;
  const selling = $derived(shop.mode === "sell");
  const cart = new SvelteMap<number, number>();
  /** The row the pad is on, for left and right. */
  let focused = $state<number | undefined>();
  const owned = (item: number) => bag.find((b) => b.item === item)?.count ?? 0;
  const total = $derived(cartTotal(cart, shop.stock));
  const maxOf = (item: number) => cartMax(cart, shop.stock, item, { mode: shop.mode, money: shop.money, owned: owned(item) });

  function setCount(item: number, count: number): void {
    if (count > 0) cart.set(item, count);
    else cart.delete(item);
  }

  function setMode(mode: "buy" | "sell"): void {
    cart.clear();
    if (mode !== shop.mode) onMode(mode);
  }

  function confirm(): void {
    for (const [item, qty] of cart) onConfirm(item, qty);
    cart.clear();
  }

  let list: HTMLElement;
  // Another tab, or the list after a purchase or sale: the pad starts on its first row.
  $effect(() => {
    void shop.mode;
    void tick().then(() => list?.querySelector<HTMLElement>("button")?.focus());
  });

  function onAction(action: Action): boolean {
    if (action === "tabPrev" || action === "tabNext") {
      setMode(action === "tabPrev" ? "buy" : "sell");
      return true;
    }
    // Tab / Start checks out (the phone stays shut while the shop is open); cancel (Esc / B) is the screen's back.
    if (action === "menu") {
      if (cart.size > 0) confirm();
      return true;
    }
    const on = document.activeElement instanceof HTMLElement && "adjust" in document.activeElement.dataset;
    if ((action === "left" || action === "right") && on && focused !== undefined) {
      const count = cart.get(focused) ?? 0;
      setCount(focused, action === "left" ? Math.max(0, count - 1) : Math.min(maxOf(focused), count + 1));
      return true;
    }
    return false;
  }
</script>

<div class="pointer-events-none absolute inset-0 z-4 bg-surface-overlay" aria-hidden="true"></div>
<section bind:this={host} class="pointer-events-none absolute inset-0 z-5 overflow-hidden" use:menu={{ onBack: onLeave, onAction }}>
  <div
    bind:this={screen}
    class="pointer-events-auto flex flex-col font-[system-ui,sans-serif] text-[length:calc(1rem/var(--dex-scale,1))] text-secondary"
    class:crt={$settings.crt}
    class:dither={$settings.dither}
    style:width="{DEX_SCREEN_W}px"
    style:height="{DEX_SCREEN_H}px"
  >
    <DexTabs tabs={TABS} current={shop.mode} onSelect={setMode} />
    <div bind:this={list} class="scrollbar-clean min-h-0 flex-1 overflow-y-auto px-4 py-2" role="tabpanel">
      {#if refused}<p class="m-0 px-3 text-error font-bold" role="alert">{refused}</p>{/if}
      {#if shop.stock.length === 0}<p class="m-0 px-3 text-secondary">{t(selling ? "shop.nothingToSell" : "shop.empty")}</p>{/if}
      {#each shop.stock as entry (entry.item)}
        <DexCounterRow
          label={selling ? `${itemName(entry.item)} ×${owned(entry.item)}` : itemName(entry.item)}
          price={`¥${entry.price}`}
          count={cart.get(entry.item) ?? 0}
          max={maxOf(entry.item)}
          onChange={(n: number) => setCount(entry.item, n)}
          onfocus={() => (focused = entry.item)}
        />
      {/each}
    </div>
    <div class="flex shrink-0 justify-between gap-3 border-0 border-t border-solid border-subtle px-7 py-2 text-sm text-primary" aria-live="polite">
      <span>{t("shop.total", { money: total })}</span>
      <span>{t("shop.balance", { money: shop.money, after: selling ? shop.money + total : shop.money - total })}</span>
    </div>
    <div class="flex shrink-0 justify-end gap-3 px-7 pb-4">
      <Button shortcut="cancel" onclick={onLeave}>{t("shop.cancel")}</Button>
      <Button variant="primary" shortcut="menu" disabled={cart.size === 0} onclick={confirm}>{t(selling ? "shop.confirmSell" : "shop.confirmBuy")}</Button>
    </div>
  </div>
</section>
