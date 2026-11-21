<script lang="ts">
  // The quick item selector in combat (spec 027, US1): a strip above the HUD. The items action (D-pad left, I)
  // opens it and moves to the next item; holding it uses the one shown. Sticks and face buttons stay on the Pokémon.
  import Glyph from "../ui/Glyph.svelte";
  import { t } from "../i18n";

  let {
    choices,
    selected,
    using,
    cooling,
    itemName,
  }: {
    choices: { item: number; count: number }[];
    selected: number;
    /** The item the trainer is using now, if any. */
    using: number | undefined;
    /** 0 to 1 of the cooldown left before the next item. */
    cooling: number;
    itemName: (id: number) => string;
  } = $props();
</script>

<section class="absolute left-3 bottom-[5.5rem] max-w-[min(calc(100%-1.5rem),22rem)] px-3 py-2 bg-surface-panel rounded-[6px] z-2 text-primary [text-shadow:0_1px_2px_#000] pointer-events-none" aria-label={t("items.wheel")} aria-live="polite">
  <header class="flex gap-2 items-center text-sm"><Glyph action="items" /> {t("items.wheel")} <small class="text-secondary">{t("items.wheelHint")}</small></header>
  {#if using !== undefined}
    <p class="m-0">{t("items.using", { item: itemName(using) })}</p>
  {:else if choices.length === 0}
    <p class="m-0">{t("items.none")}</p>
  {:else}
    <ul class="list-none m-0 p-0 flex gap-2 flex-wrap">
      {#each choices as c, i (c.item)}
        <li class="px-2 rounded-[3px] {i === selected ? 'layer-surface-selected' : ''}" aria-current={i === selected}>{itemName(c.item)} ×{c.count}</li>
      {/each}
    </ul>
  {/if}
  {#if cooling > 0}
    <div class="h-[3px] mt-1 bg-surface-raised" role="meter" aria-label={t("items.cooldown")} aria-valuemin={0} aria-valuemax={1} aria-valuenow={cooling}><div class="h-full bg-action-primary-bg" style:width="{cooling * 100}%"></div></div>
  {/if}
</section>
