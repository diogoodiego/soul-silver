<script lang="ts">
  // A type's name on its color, as the original's type badges.
  // shortcut: the colors are the HUD's TYPE_COLORS, not semantic tokens; move to the collection's type tokens
  // (its "status/bug", "status/dark"...) once every type is there.
  import type { TYPE_KEYS } from "@soulsilver/shared/game-data";
  import { TYPE_COLORS } from "../game/type-colors";
  import { t, type MessageKey } from "../i18n";

  let { type }: { type: (typeof TYPE_KEYS)[number] | "unknown" } = $props();
</script>

<span class="inline-block rounded-full px-2 py-0.5 text-[0.75em] font-bold uppercase text-white [text-shadow:0_1px_1px_rgb(0_0_0/60%)]" style:background={type === "unknown" ? "#888" : TYPE_COLORS[type]}>
  {type === "unknown" ? "?" : t(`type.${type}` as MessageKey)}
</span>
