<script lang="ts">
  // The 4 moves of the Pokémon that follows the trainer (spec 017, US3): its own moves out of combat,
  // the controlled Pokémon's with type color and cooldown in a fight.
  import type { Entity } from "@soulsilver/shared/game";
  import type { Action } from "@soulsilver/shared/input";
  import Glyph from "../Glyph.svelte";
  import { t } from "../i18n";
  import { TYPE_COLORS } from "./type-colors";

  let {
    self,
    lead,
    moveName,
    moveType,
  }: {
    /** The Pokémon under control in a fight; its moves and cooldowns win over `lead`'s. */
    self: Entity | undefined;
    lead: { moves?: number[] | undefined } | undefined;
    moveName: (move: number) => string;
    moveType: (move: number) => string | undefined;
  } = $props();

  const TICK_S = 0.05;
  const SLOTS = [1, 2, 3, 4] as const;
  /** Longest cooldown seen per slot since it was last ready, for the ring. */
  const longest: Record<number, number> = {};

  const num = (key: string) => Number(self?.data[key] ?? 0);
  const moveAt = (slot: number) => {
    const raw = self ? self.data[`move${slot}`] : lead?.moves?.[slot - 1];
    return raw === undefined ? undefined : Number(raw);
  };

  function ring(slot: number): number {
    const cd = num(`cd${slot}`);
    if (cd === 0) {
      longest[slot] = 0;
      return 0;
    }
    longest[slot] = Math.max(longest[slot] ?? 0, cd);
    return cd / longest[slot];
  }
</script>

<section class="grid grid-cols-2 gap-3" aria-label={t("party.moves")}>
  {#each SLOTS as slot (slot)}
    {@const move = moveAt(slot)}
    {@const cd = self ? num(`cd${slot}`) : 0}
    <div
      class={[
        "relative flex gap-2 items-center min-h-[clamp(2.75rem,9vh,6.25rem)] px-3 rounded-[4px] bg-dex-shell text-ink overflow-hidden border-l-8 border-l-(color:--type)",
        cd > 0 && "after:absolute after:inset-0 after:content-[''] after:bg-[conic-gradient(rgb(0_0_0/45%)_var(--ring),transparent_0)]",
      ]}
      style:--type={move === undefined ? "transparent" : (TYPE_COLORS[(moveType(move) ?? "normal") as keyof typeof TYPE_COLORS] ?? "#888")}
      style:--ring="{self ? ring(slot) * 360 : 0}deg"
    >
      <Glyph action={`move${slot}` as Action} />
      <span class="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{move === undefined ? "—" : moveName(move)}</span>
      {#if cd > 0}<span class="relative z-1 ml-auto tabular-nums">{(cd * TICK_S).toFixed(1)}s</span>{/if}
    </div>
  {/each}
</section>
