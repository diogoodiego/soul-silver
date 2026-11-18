<script lang="ts">
  // Block H: the Pokédex phone. Docked in the bottom-right corner with only its top strip showing; the menu
  // button (or a click on the strip) raises it, whole, over the game, which keeps running behind. Its screen
  // shows the home grid of apps or the open app, which `app` draws.
  import { onMount, type Snippet } from "svelte";
  import type { MenuPage } from "../game/menu-page";
  import { t } from "../i18n";
  import { DEX_SCREEN_H, DEX_SCREEN_W, DEX_STRIP_H, DEX_STRIP_LEFT, mountPokedex, type DexPose } from "../render/pokedex-model";
  import { settings } from "../settings";
  import Glyph from "../ui/Glyph.svelte";
  import AppGrid from "./AppGrid.svelte";

  let {
    open,
    page,
    disabled = [],
    onOpen,
    onClose,
    onPage,
    app,
  }: {
    open: boolean;
    page: MenuPage | undefined;
    disabled?: readonly MenuPage[];
    /** The strip was clicked while docked. */
    onOpen: () => void;
    onClose: () => void;
    /** An app from the grid, or undefined back to the grid. */
    onPage: (page: MenuPage | undefined) => void;
    app: Snippet<[MenuPage]>;
  } = $props();

  let host: HTMLDivElement;
  let screen: HTMLDivElement;
  let setPose: ((pose: DexPose) => void) | undefined;

  onMount(() => {
    const dex = mountPokedex(host, screen, "docked");
    setPose = dex.setPose;
    return dex.dispose;
  });
  $effect(() => setPose?.(open ? "raised" : "docked"));
</script>

<!-- The world shows through: only a light veil while the phone is up, as the old menu had. -->
{#if open}<div class="pointer-events-none absolute inset-0 z-4 bg-black/35" aria-hidden="true"></div>{/if}
<div bind:this={host} class="pointer-events-none absolute inset-0 z-5 overflow-hidden" aria-label={t("phone.label")} role="region">
  <div
    bind:this={screen}
    class="pointer-events-auto flex flex-col font-[system-ui,sans-serif] text-[length:calc(1rem/var(--dex-scale,1))] text-[#cfcfcf]"
    class:crt={$settings.crt}
    style:width="{DEX_SCREEN_W}px"
    style:height="{DEX_SCREEN_H}px"
  >
    <div class="flex shrink-0 items-center gap-3 pr-5 text-[0.85em] font-bold uppercase" style:height="{DEX_STRIP_H}px" style:padding-left="{DEX_STRIP_LEFT}px">
      {#if open}
        <button type="button" tabindex="-1" class="m-0 border-0 bg-transparent p-0 text-[1em] font-bold uppercase text-[#ddd]" onclick={() => (page ? onPage(undefined) : onClose())}>
          {page ? `‹ ${t("phone.home")}` : t("phone.home")}
        </button>
        <span class="ml-auto rounded-full bg-[#b23b3b] px-3 py-0.5 text-[0.85em] normal-case text-white" role="status">{t("pause.live")}</span>
        <span class="flex items-center gap-1 text-[#999]"><Glyph action="menu" round /></span>
      {:else}
        <!-- Docked: the whole strip raises the phone. -->
        <button type="button" tabindex="-1" class="m-0 flex size-full items-center gap-2 border-0 bg-transparent p-0 text-[1.4em] font-bold uppercase text-[#ddd]" onclick={onOpen} aria-label={t("phone.open")}>
          <Glyph action="menu" round /> {t("phone.home")}
        </button>
      {/if}
    </div>
    {#if open}
      <div class="relative min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-clean">
        {#if page}
          {@render app(page)}
        {:else}
          <AppGrid onOpen={(p: MenuPage) => onPage(p)} {onClose} {disabled} />
        {/if}
      </div>
    {/if}
  </div>
</div>
