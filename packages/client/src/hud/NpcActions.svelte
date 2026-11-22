<script lang="ts">
  // Block H: the options of the person in front of the trainer (talk, shop, sell, heal, battle), in a row centered
  // over their head, each with the button that picks it. The server checks the person is still in reach and offers it.
  import type { NpcAction } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import Button from "../ui/Button.svelte";
  import { NPC_KEYS } from "./npc-keys";
  import Glyph from "../ui/Glyph.svelte";

  let { x, y, actions, onPick }: { x: number; y: number; actions: readonly NpcAction[]; onPick: (action: NpcAction) => void } = $props();
</script>

<div class="absolute z-2 flex -translate-x-1/2 -translate-y-full gap-2 whitespace-nowrap" style:left="{x}px" style:top="{y}px" role="group" aria-label={t("npc.options")}>
  {#each actions as action, i (action)}
    <Button variant="primary" class="ps-1" onclick={() => onPick(action)}>
      {#if NPC_KEYS[i]}<Glyph action={NPC_KEYS[i]} round />{/if}
      {t(`npc.${action}`)}
    </Button>
  {/each}
</div>
