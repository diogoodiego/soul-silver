<script lang="ts">
  // Combat HUD (spec 017, US3): an HP bar over each foe. Block H: the controlled Pokémon's HP and status live in
  // the team's lead card (PartyStrip), and the trainer's call-out stacks with the moves in the bottom-left column.
  // Block C: the mark around a CPU Pokémon (the project's own art): white while it charges a normal move, which can be
  // parried all along; red for a special, only dodged; broken for a moment once parried. And a combo's hit counter.
  // A boss (a wild legendary, the last Pokémon of a Gym Leader or the League) has its bar at the top of the screen instead.
  import type { EntityData } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import HpBar from "../ui/HpBar.svelte";
  import StatusBars from "./StatusBars.svelte";
  import blockArt from "../../../../art/Block.svg?inline";
  import normalMark from "../../../../art/Normal.svg?inline";
  import parryMark from "../../../../art/Parry.svg?inline";
  import specialMark from "../../../../art/Special.svg?inline";

  let {
    bars,
    warnings = [],
    combos = [],
    blocks = [],
    bosses = [],
  }: {
    /** HP bars over the foes (wild and other players'), in screen pixels; `scared` while a stat stage is lowered. */
    bars: { key: string; x: number; y: number; fraction: number; scared: boolean; data: EntityData }[];
    /** Block C: a CPU Pokémon's mark, over the point at the bottom of the arc; `zoom` screen pixels per map pixel. */
    warnings?: { key: string; x: number; y: number; mark: "normal" | "special" | "parried"; zoom: number }[];
    /** Block C: hits in a row of a Pokémon's combo. */
    combos?: { key: string; x: number; y: number; count: number }[];
    /** Block C: the impact of a successful parry, centered on the point; `zoom` as above. */
    blocks?: { key: number; x: number; y: number; zoom: number }[];
    bosses?: { key: string; name: string; level: number; hp: number; hpMax: number; data: EntityData }[];
  } = $props();

  /** Each mark's art and its width on the map, in map pixels: all three are drawn at one scale (the normal arc, 179 wide, spans 36). */
  const MARKS = { normal: { src: normalMark, widthPx: 36 }, special: { src: specialMark, widthPx: 36 }, parried: { src: parryMark, widthPx: (36 * 207) / 179 } } as const;
  /** The impact of a parry, at the marks' scale. */
  const BLOCK_WIDTH_PX = (36 * 143) / 179;
</script>

{#if bosses.length > 0}
  <div class="absolute left-1/2 top-4 z-2 grid w-[min(60%,40rem)] -translate-x-1/2 gap-2 pointer-events-none">
    {#each bosses as b (b.key)}
      <div class="grid gap-1">
        <span class="text-center text-lg font-bold leading-none text-primary [text-shadow:0_1px_2px_#000]">{t("hud.boss", { name: b.name, level: b.level })}</span>
        <HpBar size="lg" fraction={b.hp / b.hpMax} role="meter" aria-label={t("hud.hp")} aria-valuemin={0} aria-valuemax={b.hpMax} aria-valuenow={b.hp} />
        <StatusBars data={b.data} />
      </div>
    {/each}
  </div>
{/if}
{#each bars as b (b.key)}
  <span class="absolute w-14 -translate-x-1/2 -translate-y-full pointer-events-none z-1" style="left: {b.x}px; top: {b.y}px" aria-hidden="true">
    <StatusBars data={b.data} />
    <span class="relative block">
      <HpBar fraction={b.fraction} />
      {#if b.scared}<span class="absolute left-full top-1/2 ml-1 -translate-y-1/2 text-sm leading-none">😨</span>{/if}
    </span>
  </span>
{/each}
{#each warnings as w (w.key)}
  <img
    class={["absolute max-w-none origin-bottom -translate-x-1/2 -translate-y-full pointer-events-none z-1", w.mark === "normal" && "scale-110"]}
    style:left="{w.x}px"
    style:top="{w.y}px"
    style:width="{MARKS[w.mark].widthPx * w.zoom}px"
    decoding="sync"
    src={MARKS[w.mark].src}
    alt=""
    aria-hidden="true"
  />
{/each}
{#each blocks as b (b.key)}
  <span class="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-1" style:left="{b.x}px" style:top="{b.y}px" style:width="{BLOCK_WIDTH_PX * b.zoom}px" aria-hidden="true">
    <img class="block w-full animate-block-burst" decoding="sync" src={blockArt} alt="" />
  </span>
{/each}
{#each combos as c (c.key)}
  <span class="absolute translate-x-6 -translate-y-full pointer-events-none z-1" style:left="{c.x}px" style:top="{c.y}px" aria-hidden="true">
    {#key c.count}
      <span class="block text-lg font-bold leading-none text-primary [text-shadow:0_1px_2px_#000] animate-combo-pop">{c.count}×</span>
    {/key}
  </span>
{/each}
