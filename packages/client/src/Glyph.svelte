<script lang="ts">
  // The key or Xbox button bound to an action, following the device used last (spec 017, FR-017).
  import { type Action, PAD_BUTTONS } from "@soulsilver/shared/input";
  import { activeDevice } from "./input/input";
  import { keyName } from "./input/key-name";
  import { settings } from "./settings";

  /** `pad` always shows the Xbox button (the controls table). */
  let { action, pad = false }: { action: Action; pad?: boolean } = $props();

  const PAD_NAMES: Record<number, string> = { 0: "A", 1: "B", 2: "X", 3: "Y", 4: "LB", 5: "RB", 6: "LT", 7: "RT", 8: "View", 9: "Start", 10: "LS", 11: "RS", 12: "↑", 13: "↓", 14: "←", 15: "→" };

  const label = $derived(
    pad || $activeDevice === "gamepad" ? PAD_NAMES[PAD_BUTTONS[action]] : keyName($settings.bindings[action][0] ?? ""),
  );
</script>


<kbd class="inline-block min-w-[1.4em] px-[0.3em] border border-current rounded-[4px] [font-family:inherit] text-[0.8em] text-center">{label}</kbd>
