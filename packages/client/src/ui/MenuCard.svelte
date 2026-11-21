<script lang="ts">
  // A menu item that sums up a group of settings: a title over a few lines; confirm opens what it sums up.
  // Like the menu variant it shows the focus (the pad's cursor): the border lights and the card rises.
  // `primary` fills it as the screen's main action (the arena's Fight); `icon` sits before the title; `media` (a sprite, a 3D preview) at the card's left.
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import Button from "./Button.svelte";

  let {
    title,
    primary = false,
    disabled = false,
    onclick,
    el = $bindable(),
    icon,
    media,
    children,
    ...rest
  }: Omit<HTMLButtonAttributes, "title" | "onclick" | "class"> & { title: string; primary?: boolean; disabled?: boolean; onclick: () => void; el?: HTMLButtonElement | undefined; icon?: Snippet; media?: Snippet; children?: Snippet } = $props();
</script>

<Button
  variant="bare"
  bind:el
  {disabled}
  {onclick}
  {...rest}
  class={[
    "box-border flex w-full items-center gap-3 rounded-xl border-2 border-solid p-4 text-left shadow-panel disabled:cursor-default disabled:opacity-50",
    primary ? "border-transparent bg-action-primary-bg text-action-primary-text [font-palette:--action-primary-text] focus:outline-2 focus:outline-offset-2 focus:outline-selected enabled:hover:layer-action-primary-bg-hover" : "border-default bg-surface-panel text-primary focus:border-selected focus:layer-surface-selected enabled:hover:layer-surface-hover",
  ]}
>
  {#if media}<span class="grid shrink-0 place-items-center" aria-hidden="true">{@render media()}</span>{/if}
  <span class="grid min-w-0 flex-1 gap-1">
  <span class="flex items-center gap-2 text-lg font-bold">{#if icon}<span class="grid size-[1.1em] shrink-0 place-items-center" aria-hidden="true">{@render icon()}</span>{/if}{title}</span>
  {#if children}<span class="grid gap-0.5 text-sm text-secondary">{@render children()}</span>{/if}
  </span>
</Button>
