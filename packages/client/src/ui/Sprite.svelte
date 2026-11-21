<script lang="ts">
  // One frame of an extracted sprite page (a Pokémon's front, a trainer's battle sprite), pixel-sharp at `scale`.
  // `frame` is a promise of it, so a preview can name what it wants before the page has loaded.
  import type { Frame } from "../game/game-data";

  let { frame, scale = 1, label }: { frame: Promise<Frame | undefined> | Frame | undefined; scale?: number; label?: string } = $props();

  let shown = $state<Frame | undefined>();
  $effect(() => {
    const wanted = frame;
    shown = undefined;
    void Promise.resolve(wanted).then((f) => {
      if (frame === wanted) shown = f;
    });
  });
</script>

{#if shown}
  <span class="inline-block shrink-0 [image-rendering:pixelated]" style:width="{shown.w * scale}px" style:height="{shown.h * scale}px" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
    <span
      class="block origin-top-left"
      style:width="{shown.w}px"
      style:height="{shown.h}px"
      style:transform="scale({scale})"
      style:background-image="url({shown.url})"
      style:background-position="-{shown.x}px -{shown.y}px"
    ></span>
  </span>
{/if}
