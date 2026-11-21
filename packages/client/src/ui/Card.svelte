<script lang="ts">
  // A sunken block grouping related fields; `invalid` rings it in the error color.
  import type { Snippet } from "svelte";

  let { invalid = false, children }: { invalid?: boolean; children: Snippet } = $props();
</script>

<div class={["grid gap-2 rounded-lg bg-sunken p-3", invalid && "outline-1 outline-error"]}>
  {@render children()}
</div>
