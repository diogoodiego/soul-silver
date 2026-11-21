<script lang="ts">
  // A panel's title (level 2) or a section title inside it (level 3).
  import type { Snippet } from "svelte";

  let { level = 3, children }: { level?: 2 | 3; children: Snippet } = $props();
</script>

<svelte:element this={`h${level}`} class={["m-0 text-primary", level === 2 ? "text-[1.4em]" : "text-[1.1em]"]}>{@render children()}</svelte:element>
