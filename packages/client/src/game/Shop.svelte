<script lang="ts">
  // Poké Mart (spec 023, US1): pick an item, a quantity, check the total, confirm. The server decides;
  // a refusal comes back as `refused` and nothing changed.
  import Button from "../ui/Button.svelte";
  import type { ServerMessage } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let {
    shop,
    bag,
    refused,
    itemName,
    onConfirm,
    onLeave,
  }: {
    shop: Extract<ServerMessage, { type: "shopOpen" }>;
    bag: { item: number; count: number }[];
    refused: string | undefined;
    itemName: (id: number) => string;
    onConfirm: (item: number, qty: number) => void;
    onLeave: () => void;
  } = $props();

  const selling = $derived(shop.mode === "sell");
  let chosen = $state<{ item: number; price: number } | undefined>();
  let qty = $state(1);
  const owned = (item: number) => bag.find((b) => b.item === item)?.count ?? 0;
  /** Buying, what the money pays for (at most 99); selling, what the bag holds. */
  const max = $derived(chosen ? (selling ? owned(chosen.item) : Math.min(99, Math.floor(shop.money / chosen.price))) : 0);
  const total = $derived(chosen ? chosen.price * qty : 0);

  function pick(entry: { item: number; price: number }): void {
    chosen = entry;
    qty = 1;
  }

  function confirm(): void {
    if (!chosen || qty < 1 || qty > max) return;
    onConfirm(chosen.item, qty);
    chosen = undefined;
  }

  function onAction(action: string): boolean {
    if (!chosen) return false;
    if (action === "tabPrev") qty = Math.max(1, qty - 1);
    else if (action === "tabNext") qty = Math.min(Math.max(1, max), qty + 1);
    else return false;
    return true;
  }
</script>

<section class="absolute inset-0 z-4 grid place-content-center p-6 bg-overlay text-primary" use:menu={{ onBack: () => (chosen ? (chosen = undefined) : onLeave()), onAction }}>
  <div class="grid gap-3 min-w-[20rem] max-w-[30rem]">
    <h2 class="m-0">{t(selling ? "shop.sellTitle" : "shop.buyTitle")}</h2>
    <p class="m-0">{t("shop.money", { money: shop.money })}</p>
    {#if refused}<p class="m-0 text-danger font-bold" role="alert">{refused}</p>{/if}
    {#if !chosen}
      {#if shop.stock.length === 0}
        <p class="m-0">{t(selling ? "shop.nothingToSell" : "shop.empty")}</p>
      {:else}
        <ul class="list-none p-0 m-0 grid gap-[0.35rem]">
          {#each shop.stock as entry (entry.item)}
            <li>
              <Button variant="ghost" class="w-full flex gap-3 justify-between" onclick={() => pick(entry)}>
                <span>{itemName(entry.item)}{#if selling} ×{owned(entry.item)}{/if}</span>
                <span>¥{entry.price}</span>
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
      <Button onclick={onLeave}>{t("shop.leave")}</Button>
    {:else}
      <p class="m-0">{t(selling ? "shop.howManySell" : "shop.howManyBuy", { item: itemName(chosen.item) })}</p>
      <div class="flex gap-3 items-center">
        <Button aria-label={t("shop.less")} disabled={qty <= 1} onclick={() => (qty = Math.max(1, qty - 1))}>−</Button>
        <output aria-live="polite">×{qty}</output>
        <Button aria-label={t("shop.more")} disabled={qty >= max} onclick={() => (qty = qty + 1)}>+</Button>
      </div>
      <p class="m-0">{t("shop.total", { money: total })}</p>
      {#if max === 0}<p class="m-0 text-secondary">{t("shop.cannotAfford")}</p>{/if}
      <div class="flex gap-3">
        <Button disabled={max === 0 || qty > max} onclick={confirm}>{t("shop.confirm")}</Button>
        <Button onclick={() => (chosen = undefined)}>{t("shop.back")}</Button>
      </div>
    {/if}
  </div>
</section>
