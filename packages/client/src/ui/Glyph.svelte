<script lang="ts">
  // The key or Xbox button bound to an action, following the device used last (spec 017, FR-017).
  import type { Action } from "@soulsilver/shared/input";
  import { activeDevice } from "../input/input";
  import { keyName, padName } from "../input/key-name";
  import { settings } from "../settings";

  /** `pad` always shows the Xbox button (the controls table). */
  /** `round`: a dark disc (a pill for long key names), as in the main menu's hints. */
  let { action, pad = false, round = false }: { action: Action; pad?: boolean; round?: boolean } = $props();

  const label = $derived(
    pad || $activeDevice === "gamepad" ? padName($settings.pad[action]) : keyName($settings.bindings[action][0] ?? ""),
  );
</script>


{#if round}
  <!-- A letter or a pad button (A, LB, ↑) is a circle; a key name (Enter, Esc) stretches into a pill. -->
  <kbd class="inline-grid place-items-center h-[1.7em] {label && label.length <= 2 ? 'w-[1.7em] px-0' : 'min-w-[1.7em] px-[0.45em]'} rounded-full bg-surface-raised text-primary [font-palette:--screen] [font-family:inherit] text-sm font-bold">{label}</kbd>
{:else}
  <kbd class="inline-block min-w-[1.4em] px-[0.3em] border border-current rounded-[4px] [font-family:inherit] text-sm text-center">{label}</kbd>
{/if}
