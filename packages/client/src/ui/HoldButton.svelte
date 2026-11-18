<script lang="ts">
  // A destructive action that must be held: the background fills while the bound action (or the mouse) is
  // held, and `onHeld` fires once when it is full. Letting go early empties it; a new hold needs a release.
  import type { Action } from "@soulsilver/shared/input";
  import { onMount } from "svelte";
  import { input } from "../input/app-input";
  import Glyph from "./Glyph.svelte";

  let {
    label,
    action,
    armed,
    onHeld,
    holdMs = 1000,
  }: {
    label: string;
    action: Action;
    /** Listens to `action` and shows its glyph: the focused slot's button. The mouse works either way. */
    armed: boolean;
    onHeld: () => void;
    holdMs?: number;
  } = $props();

  let progress = $state(0);
  let pointer = false;
  /** Fired and still held: waits for a release before filling again. */
  let spent = false;

  onMount(() => {
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const holding = pointer || (armed && input.held(action));
      if (!holding) spent = false;
      progress = holding && !spent ? Math.min(1, progress + (now - last) / holdMs) : 0;
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
</script>

<button
  type="button"
  tabindex={-1}
  class="relative overflow-hidden rounded-full border-0 bg-white/10 px-3 py-1 text-[0.85rem] font-semibold text-alarm outline-none select-none"
  onpointerdown={(event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer = true;
  }}
  onpointerup={release}
  onpointercancel={release}
  onlostpointercapture={release}
>
  <span class="absolute inset-y-0 left-0 bg-alarm/35" style:width="{progress * 100}%" aria-hidden="true"></span>
  <span class="relative inline-flex items-center gap-1">{#if armed}<Glyph {action} round />{/if}{label}</span>
</button>
