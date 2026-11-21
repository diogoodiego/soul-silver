<script lang="ts">
  // The small label above a field or a group of controls.
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<span class="text-[0.8em] font-semibold text-secondary">{@render children()}</span>
