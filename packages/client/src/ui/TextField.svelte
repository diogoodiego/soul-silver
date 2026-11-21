<script lang="ts" generics="T extends string | number">
  // A labelled text or number input in a sunken box. It fills its column unless `class` gives it a width;
  // `after` sits right of the input (a species' name).
  // The menu cursor stops on the label, not the input: confirm (a click on the label) starts typing, and
  // Enter or Esc gives the cursor back, so the arrows never get stuck in the field.
  import type { Snippet } from "svelte";
  import type { HTMLInputAttributes } from "svelte/elements";
  import Caption from "./Caption.svelte";

  let {
    label,
    value = $bindable(),
    after,
    class: width,
    ...rest
  }: Omit<HTMLInputAttributes, "value"> & { label: string; value?: T; after?: Snippet } = $props();

  // box-border: no preflight, so without it padding and border would widen the box past its column.
  const done = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    // Esc reaches the menu as cancel, which refocuses the label (input/focus.ts).
    if (e.key === "Enter") e.currentTarget.closest("label")?.focus();
  };
  const FIELD =
    "box-border min-w-0 rounded-md border border-solid border-default bg-surface-sunken px-3 py-1.5 text-base text-primary outline-none group-focus:border-selected focus:border-focus";
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<label class="group grid min-w-0 gap-1 outline-none" tabindex="0">
  <Caption>{label}</Caption>
  {#if after}
    <span class="flex min-w-0 items-center gap-2">
      <input class={[FIELD, "shrink-0", width ?? "w-20"]} tabindex="-1" bind:value onkeydown={done} {...rest} />
      {@render after()}
    </span>
  {:else}
    <input class={[FIELD, width ?? "w-full"]} tabindex="-1" bind:value onkeydown={done} {...rest} />
  {/if}
</label>
