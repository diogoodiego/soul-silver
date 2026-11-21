<script lang="ts" generics="T">
  // A labelled choice out of a list that the pad can drive: a native <select> opens an OS list the menu
  // navigation cannot reach. Confirm opens the options over the screen as a menu of their own (up and down move,
  // confirm picks, back closes as it was), starting on the current one; the focus then returns to the box.
  // `row` draws an option (an icon by its name); `preview` shows the option in focus large, beside the list, and
  // lays the options out as tiles in 4 columns (the arrows move across them, the menu navigation being spatial).
  import { tick, type Snippet } from "svelte";
  import { menu } from "../input/menu";
  import Button from "./Button.svelte";
  import Caption from "./Caption.svelte";

  let {
    label,
    options,
    value = $bindable(),
    row,
    preview,
  }: { label: string; options: [T, string][]; value: T; row?: Snippet<[T, string]>; preview?: Snippet<[T]> } = $props();

  let open = $state(false);
  let box: HTMLButtonElement = $state()!;
  /** The option the cursor is on, for the preview. */
  let focused = $state<T>(value);
  const current = $derived(options.find(([v]) => v === value)?.[1] ?? "");

  function show(): void {
    focused = value;
    open = true;
  }

  async function close(next?: { value: T }): Promise<void> {
    if (next) value = next.value;
    open = false;
    await tick();
    box.focus();
  }

  /** The current option takes the focus when the list opens, scrolled into view. */
  const OPTION = $derived(
    preview
      ? "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-solid border-transparent p-2 text-center text-[0.85em] font-semibold text-primary enabled:hover:bg-hover focus:border-selected focus:bg-raised aria-selected:bg-selected"
      : "",
  );

  const startHere = (node: HTMLElement) => {
    node.focus();
    node.scrollIntoView({ block: "center" });
  };
</script>

{#snippet line(v: T, text: string)}
  {#if row}{@render row(v, text)}{:else}{text}{/if}
{/snippet}

<div class="grid min-w-0 gap-1">
  <Caption>{label}</Caption>
  <Button
    variant="bare"
    bind:el={box}
    class="box-border flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-solid border-default bg-sunken px-3 py-1.5 text-left text-[1em] text-primary focus:border-focus"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={`${label}: ${current}`}
    onclick={show}
  >
    <span class="flex min-w-0 items-center gap-2 truncate">{@render line(value, current)}</span>
    <span class="text-secondary" aria-hidden="true">▾</span>
  </Button>
</div>

{#if open}
  <div class="fixed inset-0 z-10 flex items-center justify-center gap-4 bg-overlay p-4" use:menu={{ onBack: () => void close() }}>
    <div class={["scrollbar-clean grid max-h-[80vh] content-start overflow-y-auto rounded-xl bg-panel p-2 shadow-panel", preview ? "w-[min(46rem,60vw)] grid-cols-4 gap-1" : "w-[min(26rem,100%)] gap-0.5"]} role="listbox" aria-label={label}>
      {#each options as [v, text] (v)}
        {#if v === value}
          <Button variant={preview ? "bare" : "menu"} class={preview ? OPTION : "flex items-center gap-2 text-left"} role="option" aria-selected="true" onfocus={() => (focused = v)} onclick={() => void close({ value: v })} {@attach startHere}>{@render line(v, text)}</Button>
        {:else}
          <Button variant={preview ? "bare" : "menu"} class={preview ? OPTION : "flex items-center gap-2 text-left"} role="option" aria-selected="false" onfocus={() => (focused = v)} onclick={() => void close({ value: v })}>{@render line(v, text)}</Button>
        {/if}
      {/each}
    </div>
    {#if preview}
      <div class="grid w-[min(26rem,40vw)] content-start gap-3 rounded-xl bg-panel p-4 shadow-panel" aria-live="polite">{@render preview(focused)}</div>
    {/if}
  </div>
{/if}
