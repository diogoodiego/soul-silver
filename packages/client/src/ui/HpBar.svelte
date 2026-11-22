<script lang="ts">
  // An HP bar: green, yellow under half, red under a fifth; `lg` for a boss's. Extra attributes (role, aria-*) go on the track.
  import type { HTMLAttributes } from "svelte/elements";
  import { hpColor } from "../game/type-colors";

  let { fraction, size = "md", class: extra = "", ...rest }: { fraction: number; size?: "md" | "lg" } & HTMLAttributes<HTMLSpanElement> = $props();
</script>

<span class={["block bg-surface-raised rounded-[3px] overflow-hidden", size === "lg" ? "h-4" : "h-[0.6rem]", extra]} {...rest}>
  <span class="block h-full [transition:width_0.2s]" style:width="{fraction * 100}%" style:background={hpColor(fraction)}></span>
</span>
