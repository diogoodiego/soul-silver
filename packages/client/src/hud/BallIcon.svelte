<script lang="ts">
  // Block H: a ball's bag icon; with no ball (`item` unset), a greyed Poké Ball.
  import { itemIcons, type Frame } from "../game/game-data";

  let { item, zoom = 1 }: { item: number | undefined; zoom?: number } = $props();

  const POKE_BALL = 4;
  /** The ROM's item icons are 24 px drawn in the top-left of a 32 px cell: cropped, the ball is centred. */
  const ICON_PX = 24;
  let icons = $state<Map<number, Frame>>(new Map());
  void itemIcons().then((map) => (icons = map));
  const icon = $derived(icons.get(item ?? POKE_BALL));
</script>

{#if icon}
  <span
    class={["block [image-rendering:pixelated]", item === undefined && "opacity-40 grayscale"]}
    aria-hidden="true"
    style:zoom
    style:width="{Math.min(icon.w, ICON_PX)}px"
    style:height="{Math.min(icon.h, ICON_PX)}px"
    style:background-image="url({icon.url})"
    style:background-position="-{icon.x}px -{icon.y}px"
  ></span>
{:else}
  <span class={["block size-4 rounded-full border-2 border-white bg-[#d62a2a]", item === undefined && "opacity-40 grayscale"]} style:zoom aria-hidden="true"></span>
{/if}
