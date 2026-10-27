<script lang="ts">
  // A secondary action next to a main one, like a save slot's export, import and delete.
  import type { HTMLButtonAttributes } from "svelte/elements";

  let { children, danger = false, ...rest }: HTMLButtonAttributes & { danger?: boolean } = $props();
</script>

<button type="button" class={["text-[0.85rem] px-[0.6rem] py-1", danger && "text-alarm"]} {...rest}>{@render children?.()}</button>
