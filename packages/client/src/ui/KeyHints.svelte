<script lang="ts">
  // A screen's control hints ("A Selecionar · B Voltar"), with the bound key or button of the device used last.
  import type { Action } from "@soulsilver/shared/input";
  import Glyph from "./Glyph.svelte";

  /** Several actions share one label, e.g. up and down for "Navegar". */
  let { hints }: { hints: { actions: Action[]; label: string }[] } = $props();
</script>

<ul class="m-0 p-0 list-none flex flex-wrap gap-x-6 gap-y-2 text-base text-secondary">
  {#each hints as hint (hint.label)}
    <li class="flex items-center gap-[0.4em]">
      {#each hint.actions as action (action)}<Glyph {action} round />{/each}
      <span>{hint.label}</span>
    </li>
  {/each}
</ul>
