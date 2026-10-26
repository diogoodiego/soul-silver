<script lang="ts">
  // A species' party icon from the extracted atlas; nothing when the atlas is missing.
  import { pokemonIcons } from "./game-data";

  let { species }: { species: number } = $props();

  let frame = $state<{ url: string; x: number; y: number; w: number; h: number } | undefined>();
  $effect(() => {
    const id = species;
    void pokemonIcons().then((map) => (frame = map.get(id)));
  });
</script>

{#if frame}
  <span
    class="inline-block [image-rendering:pixelated] [zoom:1.5] align-middle"
    aria-hidden="true"
    style:width="{frame.w}px"
    style:height="{frame.h}px"
    style:background-image="url({frame.url})"
    style:background-position="-{frame.x}px -{frame.y}px"
  ></span>
{/if}
