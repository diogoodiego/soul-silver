<script lang="ts">
  // The 4 moves of the Pokémon that follows the trainer (spec 017, US3): its own moves out of combat,
  // the controlled Pokémon's with type color in a fight. Block C: slots 1–2 are normal moves (they wait only after
  // missing the first of a chain), 3–4 special ones, dimmed by a ring while they cool down.
  // Laid out like the pad (Figma "moves hud"): a diamond of X/Y (skills), B (block) and A (dash), with the specials
  // (RB/RT) as discs at its top corners. Block H: the HUD sits inside font-screen (a color font whose palette, not
  // `color`, sets the ink).
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

  const moveAt = (slot: number) => {
    const raw = self ? self.data[`move${slot}`] : lead?.moves?.[slot - 1];
    return raw === undefined ? undefined : Number(raw);
  };
  /** Share of a cooldown still to wait, 0 to 1, from the server's milliseconds. */
  const share = (left: unknown, full: unknown) => (Number(full ?? 0) > 0 ? Math.min(1, Number(left ?? 0) / Number(full)) : 0);
  const typeColor = (move: number | undefined) =>
    move === undefined ? "var(--color-dex-ink)" : (TYPE_COLORS[(moveType(move) ?? "normal") as keyof typeof TYPE_COLORS] ?? "#888");

  type Tile = { action: Action; label: string; wait: number; color: string | undefined; shape: "diamond" | "disc"; x: number; y: number };
  const move = (slot: 1 | 2 | 3 | 4, shape: Tile["shape"], x: number, y: number): Tile => {
    const m = moveAt(slot);
    const wait = self ? share(self.data[`cd${slot}`], self.data[`cdFull${slot}`]) : 0;
    return { action: `move${slot}`, label: m === undefined ? "—" : moveName(m), wait, color: typeColor(m), shape, x, y };
  };
  // Centers in cells of a 4×4 grid: the diamond's tiles touch at their corners.
  const tiles = $derived<Tile[]>([
    move(3, "disc", 0.5, 0.7),
    move(4, "disc", 3.5, 0.7),
    move(2, "diamond", 2, 1),
    move(1, "diamond", 1, 2),
    ...(self
      ? [
          { action: "guard" as Action, label: t("combat.guard"), wait: share(self.data["cdGuard"], self.data["reflexMs"]), color: undefined, shape: "diamond" as const, x: 3, y: 2 },
          { action: "dash" as Action, label: t("combat.dodge"), wait: share(self.data["cdDodge"], self.data["reflexMs"]), color: undefined, shape: "diamond" as const, x: 2, y: 3 },
        ]
      : []),
  ]);
</script>

<section class="relative size-48" aria-label={t("party.moves")}>
  {#each tiles as tile (tile.action)}
    <div
      class={[
        "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center",
        tile.shape === "diamond" ? "size-[3.9rem]" : "size-11",
      ]}
      style:left="{(tile.x / 4) * 100}%"
      style:top="{(tile.y / 4) * 100}%"
    >
      <!-- The shape: a square turned 45° or a disc, in the move's type color (reflexes black); the ring dims it while it cools down. -->
      <span
        class={[
          "absolute inset-0 overflow-hidden",
          tile.shape === "diamond" ? "rotate-45" : "rounded-full",
          tile.color === undefined && "bg-dex-ink",
          tile.wait > 0 && "after:absolute after:inset-0 after:content-[''] after:bg-[conic-gradient(rgb(0_0_0/45%)_var(--ring),transparent_0)]",
        ]}
        style:background-color={tile.color}
        style:--ring="{tile.wait * 360}deg"
      ></span>
      <span class="relative grid max-w-13 justify-items-center gap-0.5 text-center text-dex-shell">
        <!-- A dark disc on a colored tile, a light one on a black tile. -->
        <span class={["text-base", tile.color === undefined ? "[font-palette:--ink]" : "[font-palette:--screen]"]}><Glyph action={tile.action} round /></span>
        <span class={["line-clamp-2 font-semibold leading-tight [text-shadow:0_1px_2px_#000]", tile.label.length <= 6 ? "text-sm" : "text-xs"]}>{tile.label}</span>
      </span>
    </div>
  {/each}
</section>
