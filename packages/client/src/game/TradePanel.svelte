<script lang="ts">
  // The trade screen (spec 028.2): both offers side by side, Pokémon and items. Every change goes to the
  // server, which clears both confirmations; two confirmations lead to the final step, two more end it.
  import Button from "../ui/Button.svelte";
  import type { ServerMessage, TradeOffer } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import PokemonIcon from "./PokemonIcon.svelte";

  let {
    trade,
    partnerName,
    party,
    bag,
    speciesName,
    itemName,
    onAnswer,
    onOffer,
    onConfirm,
    onCancel,
    onClose,
  }: {
    trade: Extract<ServerMessage, { type: "tradeState" }>;
    partnerName: string;
    party: { species: number; level: number }[];
    bag: { item: number; count: number }[];
    speciesName: (id: number) => string;
    itemName: (id: number) => string;
    onAnswer: (accept: boolean) => void;
    onOffer: (offer: TradeOffer) => void;
    onConfirm: () => void;
    onCancel: () => void;
    /** After the trade ended (done or cancelled): the screen goes away. */
    onClose: () => void;
  } = $props();

  const trading = $derived(trade.phase === "open" || trade.phase === "final");
  const offered = (item: number) => trade.mine.items.find((i) => i.item === item)?.count ?? 0;

  /** Plain copies: `trade` is reactive state (a proxy), which cannot cross the context bridge to the main process. */
  const plainItems = () => trade.mine.items.map((i) => ({ item: i.item, count: i.count }));

  function togglePokemon(index: number): void {
    const party = trade.mine.party.includes(index) ? trade.mine.party.filter((i) => i !== index) : [...trade.mine.party, index];
    onOffer({ party, items: plainItems() });
  }
  function changeItem(item: number, by: number): void {
    const count = offered(item) + by;
    const items = plainItems().filter((i) => i.item !== item);
    onOffer({ party: [...trade.mine.party], items: count > 0 ? [...items, { item, count }] : items });
  }
</script>

<section class="absolute inset-0 z-4 grid place-content-center p-4 bg-surface-overlay text-primary" use:menu={{ onBack: () => (trading || trade.phase === "waiting" || trade.phase === "invited" ? onCancel() : onClose()) }}>
  <div class="grid gap-3 max-w-[52rem]">
    <h2 class="m-0">{t("trade.title", { name: partnerName })}</h2>

    {#if trade.phase === "invited"}
      <p class="m-0">{t("trade.invited", { name: partnerName })}</p>
      <div class="flex gap-2">
        <Button onclick={() => onAnswer(true)}>{t("trade.accept")}</Button>
        <Button onclick={() => onAnswer(false)}>{t("trade.decline")}</Button>
      </div>
    {:else if trade.phase === "waiting"}
      <p class="m-0">{t("trade.waiting", { name: partnerName })}</p>
      <Button class="justify-self-start" onclick={onCancel}>{t("trade.cancel")}</Button>
    {:else if trading}
      <div class="grid gap-4 grid-cols-2">
        <div class="grid content-start gap-2">
          <h3 class="m-0 text-base">{t("trade.mine")} {#if trade.confirmed.mine}<span class="text-primary">✓</span>{/if}</h3>
          {#each party as m, i (i)}
            <label class="flex gap-2 items-center">
              <input type="checkbox" checked={trade.mine.party.includes(i)} onchange={() => togglePokemon(i)} />
              <PokemonIcon species={m.species} /> {speciesName(m.species)} {t("trade.level", { level: m.level })}
            </label>
          {/each}
          {#each bag as b (b.item)}
            <div class="flex gap-2 items-center">
              <Button disabled={offered(b.item) === 0} onclick={() => changeItem(b.item, -1)}>−</Button>
              <span>{offered(b.item)}/{b.count}</span>
              <Button disabled={offered(b.item) >= b.count} onclick={() => changeItem(b.item, 1)}>+</Button>
              {itemName(b.item)}
            </div>
          {/each}
        </div>
        <div class="grid content-start gap-2">
          <h3 class="m-0 text-base">{t("trade.theirs", { name: partnerName })} {#if trade.confirmed.theirs}<span class="text-primary">✓</span>{/if}</h3>
          {#if trade.theirs.party.length === 0 && trade.theirs.items.length === 0}<p class="m-0 text-secondary">{t("trade.nothing")}</p>{/if}
          {#each trade.theirs.party as i (i)}<p class="m-0">{t("trade.theirPokemon", { slot: i + 1 })}</p>{/each}
          {#each trade.theirs.items as it (it.item)}<p class="m-0">{it.count} × {itemName(it.item)}</p>{/each}
        </div>
      </div>
      {#if trade.phase === "final"}<p class="m-0 text-primary">{t("trade.finalHint")}</p>{/if}
      <div class="flex gap-2">
        <Button disabled={trade.confirmed.mine} onclick={onConfirm}>{trade.phase === "final" ? t("trade.confirmFinal") : t("trade.confirm")}</Button>
        <Button onclick={onCancel}>{t("trade.cancel")}</Button>
      </div>
    {:else}
      <p class="m-0">{trade.phase === "done" ? t("trade.done") : t("trade.cancelled")}</p>
      <Button class="justify-self-start" onclick={onClose}>{t("trade.close")}</Button>
    {/if}
  </div>
</section>
