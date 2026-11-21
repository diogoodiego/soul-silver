<script lang="ts">
  // A small read-only pill: a move's name under its number.
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<span class="inline-block rounded-full bg-raised px-2 py-0.5 text-[0.8em] text-primary">{@render children()}</span>
