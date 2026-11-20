<script lang="ts">
  // The 4 moves of the Pokémon that follows the trainer (spec 017, US3): its own moves out of combat,
  // the controlled Pokémon's with type color in a fight, all dimmed until its action bar is full.
  // Block H: the HUD sits inside font-screen (a color font whose palette, not `color`, sets the ink), so the
  // light cards use the dark palette.
  import type { Entity } from "@soulsilver/shared/game";
  import type { Action } from "@soulsilver/shared/input";
  import Glyph from "../ui/Glyph.svelte";
  import { t } from "../i18n";
  import { TYPE_COLORS } from "./type-colors";

  let {
    self,
    lead,
    moveName,
    moveType,
  }: {
    /** The Pokémon under control in a fight; its moves and action bar win over `lead`'s. */
    self: Entity | undefined;
    lead: { moves?: number[] | undefined } | undefined;
    moveName: (move: number) => string;
    moveType: (move: number) => string | undefined;
  } = $props();

  const SLOTS = [1, 2, 3, 4] as const;

  const moveAt = (slot: number) => {
    const raw = self ? self.data[`move${slot}`] : lead?.moves?.[slot - 1];
    return raw === undefined ? undefined : Number(raw);
  };
  /** Share of the action bar still to fill: 0 when a move can go. */
  const waiting = $derived(self ? 1 - Number(self.data["gauge"] ?? 0) / 100 : 0);
</script>

<section class="grid grid-cols-2 gap-3" aria-label={t("party.moves")}>
  {#each SLOTS as slot (slot)}
    {@const move = moveAt(slot)}
    <div
      class={[
        "relative flex gap-2 items-center [font-palette:--ink] min-h-[clamp(2.75rem,9vh,6.25rem)] px-3 rounded-[4px] bg-dex-shell text-dex-ink overflow-hidden border-l-8 border-l-(color:--type)",
        waiting > 0 && "after:absolute after:inset-0 after:content-[''] after:bg-[conic-gradient(rgb(0_0_0/45%)_var(--ring),transparent_0)]",
      ]}
      style:--type={move === undefined ? "transparent" : (TYPE_COLORS[(moveType(move) ?? "normal") as keyof typeof TYPE_COLORS] ?? "#888")}
      style:--ring="{waiting * 360}deg"
    >
      <!-- The key or button for this move: a dark disc, in the screen's light palette (block H). -->
      <span class="relative z-1 shrink-0 text-[1.1rem] [font-palette:--screen]"><Glyph action={`move${slot}` as Action} round /></span>
      <span class="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{move === undefined ? "—" : moveName(move)}</span>
    </div>
  {/each}
</section>
