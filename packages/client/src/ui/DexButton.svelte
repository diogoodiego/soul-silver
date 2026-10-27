<script lang="ts">
  // The teal menu button of the panel beside the game screen.
  import type { HTMLButtonAttributes } from "svelte/elements";

  let { children, ...rest }: HTMLButtonAttributes = $props();
</script>

<button
  type="button"
  class="border-2 border-stone-950 bg-stone-950 border-b-6 m-0 p-0 rounded"
  {...rest}
  ><div
    class="min-h-[clamp(2.75rem,9vh,6.25rem)] rounded-xs border-4 border-b-0 border-white/20 bg-dex-teal text-ink font-semibold text-[1.05rem] hover:brightness-110 active:translate-y-px disabled:opacity-50 disabled:cursor-default flex items-center justify-center"
  >
    {@render children?.()}
  </div></button
>
