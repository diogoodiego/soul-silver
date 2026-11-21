<script lang="ts" generics="Id extends string">
  // The tab strip on the Pokédex screen's raised top: tabPrev/tabNext (Q/E, pad LB/RB) step the tabs, a click picks
  // one. The tabs are not in the focus order: the pad's arrows stay in the list below.
  import Button from "./Button.svelte";
  import Glyph from "./Glyph.svelte";
  import { DEX_STRIP_H, DEX_STRIP_LEFT } from "../render/pokedex-model";

  let { tabs, current, onSelect }: { tabs: readonly { id: Id; label: string }[]; current: Id; onSelect: (id: Id) => void } = $props();
</script>

<div class="flex shrink-0 items-center gap-2 pr-5 text-sm font-bold uppercase" style:height="{DEX_STRIP_H}px" style:padding-left="{DEX_STRIP_LEFT}px" role="tablist">
  <span class="flex items-center gap-1 text-tertiary">&lt;<Glyph action="tabPrev" round /></span>
  {#each tabs as tab, i (tab.id)}
    {#if i > 0}<span class="text-disabled" aria-hidden="true">|</span>{/if}
    <Button role="tab" tabindex={-1} aria-selected={current === tab.id} variant="ghost" onclick={() => onSelect(tab.id)}>{tab.label}</Button>
  {/each}
  <span class="ml-auto flex items-center gap-1 text-tertiary"><Glyph action="tabNext" round />&gt;</span>
</div>
