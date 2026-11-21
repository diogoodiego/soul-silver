<script lang="ts">
  // A raised window: a title, a body that scrolls, and a footer for its actions.
  // `class` places and sizes it; the body lays out its own content.
  import type { Snippet } from "svelte";
  import Heading from "./Heading.svelte";

  let {
    title,
    footer,
    class: extra,
    children,
  }: { title: string; footer?: Snippet; class?: string; children: Snippet } = $props();
</script>

<section class={["grid grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl bg-surface-panel shadow-panel", extra]} aria-label={title}>
  <header class="grid gap-1 border-b border-default px-6 py-4">
    <Heading level={2}>{title}</Heading>
  </header>
  <div class="scrollbar-clean min-h-0 overflow-y-auto px-6 py-5">{@render children()}</div>
  {#if footer}
    <footer class="flex flex-wrap items-center justify-end gap-3 border-t border-default px-6 py-3">{@render footer()}</footer>
  {/if}
</section>
