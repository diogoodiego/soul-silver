<script lang="ts">
  // A secondary action next to a main one, like a save slot's export, import and delete.
  import type { HTMLButtonAttributes } from "svelte/elements";

  let { children, danger = false, ...rest }: HTMLButtonAttributes & { danger?: boolean } = $props();
</script>

<button
  type="button"
  class={["rounded-full border-0 bg-white/10 px-3 py-1 text-[0.85rem] font-semibold outline-none focus:bg-white", danger ? "text-alarm" : "text-zinc-200 focus:text-ink"]}
  {...rest}
>{@render children?.()}</button>
