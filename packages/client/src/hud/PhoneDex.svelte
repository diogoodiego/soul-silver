<script lang="ts">
  // Block H: the Pokédex phone. Docked in the bottom-right corner with only its top strip showing; the menu
  // button (or a click on the strip) raises it, whole, over the game, which keeps running behind. Its screen
  // shows the home grid of apps or the open app, which `app` draws.
  import Button from "../ui/Button.svelte";
  import { onMount, type Snippet } from "svelte";
  import type { MenuPage } from "../game/menu-page";
  import { t } from "../i18n";
  import { DEX_SCREEN_H, DEX_SCREEN_W, DEX_STRIP_H, DEX_STRIP_LEFT, mountPokedex, type DexPose } from "../render/pokedex-model";
  import { settings } from "../settings";
  import AppGrid from "./AppGrid.svelte";

  let {
    open,
    page,
    disabled = [],
    onOpen,
    onClose,
    onPage,
    onLeave,
    leaving = false,
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
    /** Saves and leaves to the main menu (the grid's last tile). */
    onLeave: () => void;
    leaving?: boolean;
    app: Snippet<[MenuPage]>;
  } = $props();

  let host: HTMLDivElement;
  let screen: HTMLDivElement;
  let menuButton: HTMLButtonElement = $state()!;
  let setPose: ((pose: DexPose) => void) | undefined;
  let setDither = $state<(on: boolean) => void>();

  onMount(() => {
    const dex = mountPokedex(host, screen, "docked", menuButton);
    setPose = dex.setPose;
    setDither = dex.setDither;
    return dex.dispose;
  });
  $effect(() => setPose?.(open ? "raised" : "docked"));
  $effect(() => setDither?.($settings.dither));
</script>

<!-- The world shows through: only a light veil while the phone is up, as the old menu had. -->
{#if open}<div class="pointer-events-none absolute inset-0 z-4 bg-surface-overlay" aria-hidden="true"></div>{/if}
<div bind:this={host} class="pointer-events-none absolute inset-0 z-5 overflow-hidden" aria-label={t("phone.label")} role="region">
  <div
    bind:this={screen}
    class="pointer-events-auto flex flex-col font-[system-ui,sans-serif] text-[length:calc(1rem/var(--dex-scale,1))] text-secondary"
    class:crt={$settings.crt}
    class:dither={$settings.dither}
    style:width="{DEX_SCREEN_W}px"
    style:height="{DEX_SCREEN_H}px"
  >
    <div class="flex shrink-0 items-center gap-3 pr-5 text-sm font-bold uppercase" style:height="{DEX_STRIP_H}px" style:padding-left="{DEX_STRIP_LEFT}px">
      {#if open}
        <Button tabindex={-1} variant="bare" class="p-0 text-base font-bold uppercase text-secondary" onclick={() => (page ? onPage(undefined) : onClose())}>
          {page ? `‹ ${t("phone.home")}` : t("phone.home")}
        </Button>
        <span class="ml-auto rounded-full bg-[#b23b3b] px-3 py-0.5 text-sm normal-case text-white" role="status">{t("pause.live")}</span>
      {:else}
        <!-- Docked: the whole strip raises the phone. -->
        <Button tabindex={-1} variant="bare" class="flex size-full items-center gap-2 p-0 text-2xl font-bold uppercase text-secondary" onclick={onOpen} aria-label={t("phone.open")}>
          {t("phone.home")}
        </Button>
      {/if}
    </div>
    {#if open}
      <div class="relative min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-clean">
        {#if page}
          {@render app(page)}
        {:else}
          <AppGrid onOpen={(p: MenuPage) => onPage(p)} {onClose} {onLeave} {leaving} {disabled} />
        {/if}
      </div>
    {/if}
  </div>
  <!-- On the red body, top right (placed by the model): opens and closes the phone. -->
  <Button
    bind:el={menuButton}
    variant="bare"
    tabindex={-1}
    class="pointer-events-auto grid place-items-center rounded-full border-2 border-[#7a0a1c] bg-[#141414] p-0 text-[#f2f2f2] shadow-[inset_0_2px_3px_rgb(255_255_255/18%)] active:bg-[#2a2a2a]"
    onclick={() => (open ? onClose() : onOpen())}
    aria-label={open ? t("phone.close") : t("phone.open")}
    aria-expanded={open}
  >
    <svg viewBox="0 0 24 24" class="size-[60%]" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" /></svg>
  </Button>
</div>
