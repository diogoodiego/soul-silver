<script lang="ts" module>
  /** secondary (the default): outlined, no fill; primary: the screen's main action, filled; danger: a secondary in red;
   * ghost: list rows and tabs, no fill nor border; menu: main-menu options, larger, focus filled;
   * secondary, primary and danger show focus with a ring; bare: drawn controls (a Poké Ball, the phone key) that style themselves. */
  export type ButtonVariant = "secondary" | "primary" | "danger" | "ghost" | "menu" | "bare";
  /** A destructive action that must be held: the fill grows while `action` (or the mouse) is held, `onHeld` fires once. */
  export type ButtonHold = { action: Action; armed: boolean; onHeld: () => void; ms?: number };
</script>

<script lang="ts">
  // The app's only button: one size for every screen; `variant` sets the look.
  import type { Action } from "@soulsilver/shared/input";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { input } from "../input/app-input";
  import Glyph from "./Glyph.svelte";

  let {
    children,
    variant = "secondary",
    glyph,
    shortcut,
    hold,
    el = $bindable(),
    class: extra,
    type = "button",
    ...rest
  }: HTMLButtonAttributes & {
    variant?: ButtonVariant;
    /** Shown while focused: the action that presses it (a main-menu option shows confirm). */
    glyph?: Action;
    /** Always shown: the action that presses it from anywhere on the screen (the screen handles the action). */
    shortcut?: Action;
    hold?: ButtonHold;
    el?: HTMLButtonElement | undefined;
  } = $props();

  const SIZE = "rounded-full px-3 py-1 text-sm font-semibold leading-snug";
  // Hover and pressed lay a layer over the fill; selected and disabled replace it. Inside font-screen (a color font) the
  // ink comes from font-palette, not color: dark text on action/primary/bg also sets the --action-primary-text palette.
  /** The pad and the keys land on buttons too: the outlined and filled ones show it with a ring. */
  const RING = "focus:outline-2 focus:outline-solid focus:outline-offset-2 focus:outline-focus";
  const STATE =
    "aria-selected:layer-surface-selected aria-selected:text-primary aria-pressed:layer-surface-selected aria-pressed:text-primary disabled:bg-action-disabled-bg disabled:text-action-disabled-text disabled:cursor-default items-center";
  const LOOK: Record<ButtonVariant, string> = {
    secondary: `${SIZE} ${STATE} ${RING} border border-default enabled:hover:layer-action-secondary-bg-hover enabled:active:layer-action-secondary-bg-pressed text-action-secondary-text`,
    primary: `${SIZE} ${STATE} ${RING} bg-action-primary-bg text-action-primary-text [font-palette:--action-primary-text] font-bold enabled:hover:layer-action-primary-bg-hover enabled:active:layer-action-primary-bg-pressed`,
    danger: `${SIZE} ${STATE} ${RING} border border-default enabled:hover:layer-action-secondary-bg-hover enabled:active:layer-action-secondary-bg-pressed text-error`,
    ghost: `${SIZE} ${STATE} enabled:hover:layer-action-ghost-bg-hover enabled:active:layer-action-ghost-bg-pressed text-action-ghost-text`,
    menu: `rounded-full px-3 py-1.5 text-lg font-semibold ${STATE} enabled:hover:layer-action-ghost-bg-hover enabled:active:layer-action-ghost-bg-pressed text-primary focus:bg-action-primary-bg focus:[font-palette:--action-primary-text] focus:text-action-primary-text`,
    bare: "",
  };

  let progress = $state(0);
  let pointer = false;
  /** Fired and still held: waits for a release before filling again. */
  let spent = false;

  $effect(() => {
    const h = hold;
    if (!h) return;
    const { action, onHeld, ms = 1000 } = h;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const holding = pointer || (h.armed && input.held(action));
      if (!holding) spent = false;
      progress = holding && !spent ? Math.min(1, progress + (now - last) / ms) : 0;
      if (progress >= 1) {
        spent = true;
        progress = 0;
        onHeld();
      }
      last = now;
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  });

  const release = () => (pointer = false);
  const holdEvents = $derived(
    hold
      ? {
          tabindex: -1,
          onpointerdown: (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer = true;
          },
          onpointerup: release,
          onpointercancel: release,
          onlostpointercapture: release,
        }
      : {},
  );
</script>

<button
  bind:this={el}
  {type}
  class={["group cursor-pointer select-none", LOOK[variant], hold && "relative overflow-hidden", extra]}
  {...rest}
  {...holdEvents}
>
  {#if hold}
    <span class="absolute inset-y-0 left-0 bg-alarm/35" style:width="{progress * 100}%" aria-hidden="true"></span>
    <span class="relative inline-flex items-center gap-1">{#if hold.armed}<Glyph action={hold.action} round />{/if}{@render children?.()}</span>
  {:else if shortcut}
    <span class="inline-flex items-center gap-2"><Glyph action={shortcut} round />{@render children?.()}</span>
  {:else if glyph}
    <span class="inline-flex items-center gap-2"><span class="hidden group-focus:inline-flex"><Glyph action={glyph} round /></span>{@render children?.()}</span>
  {:else}
    {@render children?.()}
  {/if}
</button>
