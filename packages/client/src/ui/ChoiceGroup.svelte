<script lang="ts" generics="T extends string">
  // A row of pill choices, one picked. Buttons with radio semantics, not native radios: the menu navigation
  // treats an <input> as a text field (confirm and left/right left to it), so the pad could not pick one.
  // Like the menu cards, the focused pill lights its border: the pad's cursor.
  import type { Action } from "@soulsilver/shared/input";
  import Button from "./Button.svelte";
  import Caption from "./Caption.svelte";
  import Glyph from "./Glyph.svelte";

  /** `shortcut`: an action the screen binds to step the choice, shown by the label. */
  let { label, options, value = $bindable(), shortcut }: { label: string; options: [T, string][]; value: T; shortcut?: Action } = $props();
</script>

<div class="grid gap-1" role="radiogroup" aria-label={label}>
  <span class="flex items-center gap-1.5"><Caption>{label}</Caption>{#if shortcut}<Glyph action={shortcut} round />{/if}</span>
  <div class="flex flex-wrap gap-1.5">
    {#each options as [v, text] (v)}
      <Button
        variant="bare"
        role="radio"
        aria-checked={value === v}
        class="rounded-full border border-solid border-default px-3 py-1 text-sm font-semibold text-action-secondary-text hover:layer-action-secondary-bg-hover focus:border-selected aria-checked:layer-surface-selected aria-checked:text-primary"
        onclick={() => (value = v)}
      >
        {text}
      </Button>
    {/each}
  </div>
</div>
