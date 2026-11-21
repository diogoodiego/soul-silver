<script lang="ts" generics="T extends string | number">
  // A labelled text or number input in a sunken box. It fills its column unless `class` gives it a width;
  // `after` sits right of the input (a species' name).
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
  /** Enter ends the editing: the field lets go of the focus, and the menu's arrows go on from it. */
  const done = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };
  const FIELD = "box-border min-w-0 rounded-md border border-solid border-default bg-sunken px-3 py-1.5 text-[1em] text-primary outline-none focus:border-focus";
</script>

<label class="grid min-w-0 gap-1">
  <Caption>{label}</Caption>
  {#if after}
    <span class="flex min-w-0 items-center gap-2">
      <input class={[FIELD, "shrink-0", width ?? "w-20"]} bind:value onkeydown={done} {...rest} />
      {@render after()}
    </span>
  {:else}
    <input class={[FIELD, width ?? "w-full"]} bind:value onkeydown={done} {...rest} />
  {/if}
</label>
