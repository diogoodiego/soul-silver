<script lang="ts">
  // One option on the Pokédex screen: label left, value right; the focused row turns light with a ">" cursor.
  // `adjust` answers left and right (the screen reads data-adjust off the focused row); a click steps forward.
  import type { Snippet } from "svelte";

  let {
    label,
    value,
    children,
    onclick,
    onfocus,
    adjustable = false,
    pressed,
  }: {
    label: string;
    value?: string | undefined;
    children?: Snippet | undefined;
    onclick: () => void;
    onfocus?: (() => void) | undefined;
    adjustable?: boolean;
    pressed?: boolean | undefined;
  } = $props();
</script>

<button
  type="button"
  class="group flex w-full items-center justify-between gap-6 border-0 bg-transparent px-3 py-[0.35em] text-left text-[1.15em] font-bold text-[#cfcfcf] outline-none focus:bg-[#e8e8e8] focus:text-[#111]"
  data-adjust={adjustable ? "" : undefined}
  aria-pressed={pressed}
  {onclick}
  {onfocus}
>
  <span><span class="inline-block w-[1.4ch] opacity-0 group-focus:opacity-100" aria-hidden="true">&gt;</span>{label}</span>
  <span class="whitespace-pre text-right">{#if children}{@render children()}{:else}{value}{/if}</span>
</button>
