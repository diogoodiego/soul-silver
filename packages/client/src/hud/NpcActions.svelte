<script lang="ts" module>
  import type { Action } from "@soulsilver/shared/input";
  /** The options take the moves' buttons, as in a fight: the first is interact (A, move 1's button on the pad), then moves 2 and 3. */
  export const NPC_KEYS: readonly Action[] = ["interact", "move2", "move3"];
</script>

<script lang="ts">
  // Block H: the options around the person in front of the trainer (talk, shop, sell, heal, battle), fanned over their
  // head, each with the button that picks it. The server checks the person is still in reach and offers it.
  import type { NpcAction } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import Button from "../ui/Button.svelte";
  import Glyph from "../ui/Glyph.svelte";

  let { x, y, actions, onPick }: { x: number; y: number; actions: readonly NpcAction[]; onPick: (action: NpcAction) => void } = $props();

  const RADIUS_PX = 56;
  /** From the left over the top to the right: one option straight above the person, more fanned out evenly. */
  const at = (i: number) => {
    const angle = Math.PI + (Math.PI * (i + 0.5)) / actions.length;
    return { left: x + Math.cos(angle) * RADIUS_PX, top: y + Math.sin(angle) * RADIUS_PX };
  };
</script>

<div class="pointer-events-none absolute inset-0 z-2" role="group" aria-label={t("npc.options")}>
  {#each actions as action, i (action)}
    {@const p = at(i)}
    <div class="pointer-events-auto absolute -translate-1/2" style:left="{p.left}px" style:top="{p.top}px">
      <Button variant="primary" class="flex gap-1.5 whitespace-nowrap shadow-[0_1px_3px_#000a]" onclick={() => onPick(action)}>
        {#if NPC_KEYS[i]}<Glyph action={NPC_KEYS[i]} round />{/if}
        {t(`npc.${action}`)}
      </Button>
    </div>
  {/each}
</div>
