<script lang="ts">
  // Block H: the Pokédex phone's home screen, its apps as a grid of icons. The pad moves between them as in
  // any menu; B or the menu button put the phone away. The last tile saves and leaves to the main menu.
  import Button from "../ui/Button.svelte";
  import type { Action } from "@soulsilver/shared/input";
  import { onMount } from "svelte";
  import { APPS, type MenuPage } from "../game/menu-page";
  import { t, type MessageKey } from "../i18n";
  import { menu } from "../input/menu";

  let {
    onOpen,
    onClose,
    onLeave,
    leaving = false,
    disabled = [],
  }: { onOpen: (page: MenuPage) => void; onClose: () => void; onLeave: () => void; leaving?: boolean; disabled?: readonly MenuPage[] } = $props();

  /** A tile: the icon lights while focused (by the pad too, so focus, not focus-visible). */
  const TILE = "grid justify-items-center gap-1.5 p-1 text-base text-secondary disabled:opacity-35";
  const ICON = "grid size-[3.6em] place-items-center rounded-[22%] text-icon-primary shadow-[0_2px_0_#0006] transition-transform group-hover:scale-105 group-focus:scale-110 group-focus:outline-4 group-focus:outline-focus";

  const LABELS: Record<MenuPage, MessageKey> = {
    party: "pause.party",
    bag: "pause.bag",
    dex: "pause.dex",
    trainer: "pause.trainer",
    gear: "pause.gear",
    field: "pause.field",
    online: "pause.online",
    save: "pause.save",
    settings: "pause.settings",
  };
  /** Each app's tile colour. */
  const TINTS: Record<MenuPage, string> = {
    party: "#e05a4f",
    bag: "#d9902f",
    dex: "#c8333f",
    trainer: "#3f6fc4",
    gear: "#5a5f6e",
    field: "#3f9a5a",
    online: "#2f9db0",
    save: "#7a5ac4",
    settings: "#6b6b6b",
  };

  let grid: HTMLElement;
  onMount(() => grid.querySelector<HTMLElement>("button:not(:disabled)")?.focus());

  const onAction = (action: Action) => (action === "menu" ? (onClose(), true) : false);
</script>

{#snippet glyph(page: MenuPage)}
  <svg viewBox="0 0 24 24" class="size-[2.2em]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if page === "party"}
      <circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M3 19c0-3 2.5-5 5-5s5 2 5 5M11 19c0-3 2.5-5 5-5s5 2 5 5" />
    {:else if page === "bag"}
      <path d="M5 9h14l-1 11H6z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /><path d="M9 13h6" />
    {:else if page === "dex"}
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /><path d="M9 8h6" />
    {:else if page === "trainer"}
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16c.6-1.6 2-2.4 3.5-2.4s2.9.8 3.5 2.4M14 10h4M14 13h4" />
    {:else if page === "gear"}
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10 18.5h4M10 6h4" />
    {:else if page === "field"}
      <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 19l7-7" />
    {:else if page === "online"}
      <path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 12.8a6.5 6.5 0 0 1 9 0" /><circle cx="12" cy="17" r="1.6" />
    {:else if page === "save"}
      <path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" />
    {:else}
      <circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    {/if}
  </svg>
{/snippet}

<nav bind:this={grid} class="grid h-full grid-cols-3 content-center gap-x-6 gap-y-4 px-10 py-4" aria-label={t("phone.home")} use:menu={{ onBack: onClose, onAction }}>
  {#each APPS as page (page)}
    <Button variant="bare" class={TILE} disabled={disabled.includes(page)} onclick={() => onOpen(page)}>
      <span class={ICON} style:background={TINTS[page]}>
        {@render glyph(page)}
      </span>
      <span class="text-sm font-semibold">{t(LABELS[page])}</span>
    </Button>
  {/each}
  <Button variant="bare" class={TILE} disabled={leaving} onclick={onLeave}>
    <span class={ICON} style:background="#8a3a3a">
      <svg viewBox="0 0 24 24" class="size-[2.2em]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 4H6v16h8" /><path d="M10 12h10M17 9l3 3-3 3" />
      </svg>
    </span>
    <span class="text-sm font-semibold">{leaving ? t("pause.saving") : t("pause.leave")}</span>
  </Button>
</nav>
