<script lang="ts">
  // An HP bar: green, yellow under half, red under a fifth. Extra attributes (role, aria-*) go on the track.
  import type { HTMLAttributes } from "svelte/elements";
  import { hpColor } from "../game/type-colors";

  let { fraction, class: extra = "", ...rest }: { fraction: number } & HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span class="block h-[0.6rem] bg-surface-raised rounded-[3px] overflow-hidden {extra}" {...rest}>
  <span class="block h-full [transition:width_0.2s]" style:width="{fraction * 100}%" style:background={hpColor(fraction)}></span>
</span>
