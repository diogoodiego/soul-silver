<script lang="ts">
  // The 4 moves of the Pokémon that follows the trainer (spec 017, US3): its own moves out of combat,
  // the controlled Pokémon's with type color in a fight. Block C: slots 1–2 are normal moves (they wait only after
  // missing the first of a chain), 3–4 special ones, dimmed by a ring while they cool down; below, the dodge and parry cooldowns.
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
    /** The Pokémon under control in a fight; its moves and cooldowns win over `lead`'s. */
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
  /** Share of a cooldown still to wait, 0 to 1, from the server's milliseconds. */
  const share = (left: unknown, full: unknown) => (Number(full ?? 0) > 0 ? Math.min(1, Number(left ?? 0) / Number(full)) : 0);
  const waiting = (slot: number) => (self ? share(self.data[`cd${slot}`], self.data[`cdFull${slot}`]) : 0);
  const reflexes = $derived(
    self
      ? [
          { action: "dash" as Action, label: t("combat.dodge"), wait: share(self.data["cdDodge"], self.data["reflexMs"]) },
          { action: "guard" as Action, label: t("combat.guard"), wait: share(self.data["cdGuard"], self.data["reflexMs"]) },
        ]
      : [],
  );
</script>

<section class="grid grid-cols-2 gap-3" aria-label={t("party.moves")}>
  {#each SLOTS as slot (slot)}
    {@const move = moveAt(slot)}
    {@const wait = waiting(slot)}
    <div
      class={[
        "relative flex gap-2 items-center [font-palette:--ink] min-h-[clamp(2.75rem,9vh,6.25rem)] px-3 rounded-[4px] bg-dex-shell text-dex-ink overflow-hidden border-l-8 border-l-(color:--type)",
        wait > 0 && "after:absolute after:inset-0 after:content-[''] after:bg-[conic-gradient(rgb(0_0_0/45%)_var(--ring),transparent_0)]",
      ]}
      style:--type={move === undefined ? "transparent" : (TYPE_COLORS[(moveType(move) ?? "normal") as keyof typeof TYPE_COLORS] ?? "#888")}
      style:--ring="{wait * 360}deg"
    >
      <!-- The key or button for this move: a dark disc, in the screen's light palette (block H). -->
      <span class="relative z-1 shrink-0 text-lg [font-palette:--screen]"><Glyph action={`move${slot}` as Action} round /></span>
      <span class="overflow-hidden text-ellipsis whitespace-nowrap font-semibold">{move === undefined ? "—" : moveName(move)}</span>
      {#if slot > 2}<span class="ml-auto shrink-0 text-xs">{t("combat.special")}</span>{/if}
    </div>
  {/each}
  {#each reflexes as r (r.action)}
    <div
      class={[
        "relative flex gap-2 items-center [font-palette:--ink] px-3 py-1 rounded-[4px] bg-dex-shell text-dex-ink overflow-hidden",
        r.wait > 0 && "after:absolute after:inset-0 after:content-[''] after:bg-[conic-gradient(rgb(0_0_0/45%)_var(--ring),transparent_0)]",
      ]}
      style:--ring="{r.wait * 360}deg"
    >
      <span class="relative z-1 shrink-0 text-base [font-palette:--screen]"><Glyph action={r.action} round /></span>
      <span class="text-sm font-semibold">{r.label}</span>
    </div>
  {/each}
</section>
