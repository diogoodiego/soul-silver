<script lang="ts">
  // Combat HUD (spec 017, US3): HP, level and status of the Pokémon under control, its 4 moves with
  // the type color and cooldown, an HP bar over each wild foe, and the party at a glance.
  import type { Entity } from "@soulsilver/shared/game";
  import type { Action } from "@soulsilver/shared/input";
  import Glyph from "../Glyph.svelte";
  import { t, type MessageKey } from "../i18n";
  import { TYPE_COLORS } from "./type-colors";

  let {
    self,
    bars,
    party,
    active,
    speciesName,
    moveName,
    moveType,
  }: {
    /** The Pokémon the player controls, or undefined between swaps. */
    self: Entity | undefined;
    /** HP bars over the foes (wild and other players'), in screen pixels. */
    bars: { key: string; x: number; y: number; fraction: number }[];
    party: { species: number; level: number; hp: number; hpMax: number }[];
    active: number | undefined;
    speciesName: (species: number) => string;
    moveName: (move: number) => string;
    moveType: (move: number) => string | undefined;
  } = $props();

  const TICK_S = 0.05;
  const SLOTS = [1, 2, 3, 4] as const;
  /** Longest cooldown seen per slot since it was last ready, for the ring. */
  const longest: Record<number, number> = {};

  const num = (key: string) => Number(self?.data[key] ?? 0);
  const hpFraction = $derived(num("hpMax") > 0 ? num("hp") / num("hpMax") : 0);
  const status = $derived(String(self?.data["status"] ?? ""));

  function ring(slot: number): number {
    const cd = num(`cd${slot}`);
    if (cd === 0) {
      longest[slot] = 0;
      return 0;
    }
    longest[slot] = Math.max(longest[slot] ?? 0, cd);
    return cd / longest[slot];
  }

  const track = "block h-[0.6rem] bg-black/60 rounded-[3px] overflow-hidden";
  const fill = "block h-full [transition:width_0.2s]";
  const panel = "bg-panel rounded-[6px] px-3 py-2";

  const hpColor = (f: number) => (f > 0.5 ? "#4caf50" : f > 0.2 ? "#f5c518" : "#e53935");
</script>

{#each bars as b (b.key)}
  <div class="{track} absolute w-14 -translate-x-1/2 -translate-y-full pointer-events-none z-1" style:left="{b.x}px" style:top="{b.y}px" aria-hidden="true">
    <span class={fill} style:width="{b.fraction * 100}%" style:background={hpColor(b.fraction)}></span>
  </div>
{/each}

<div class="absolute inset-x-0 bottom-0 grid grid-cols-[minmax(12rem,18rem)_1fr] [grid-template-areas:'party_party'_'mon_moves'] gap-2 p-3 pointer-events-none z-2 text-white [text-shadow:0_1px_2px_#000]" aria-label={t("hud.label")}>
  {#if self}
    <section class="{panel} [grid-area:mon]">
      <header class="flex gap-2 items-baseline">
        <strong>{speciesName(num("species"))}</strong>
        <span>{t("hud.level", { level: num("level") })}</span>
        {#if status}<span class="px-[0.3rem] rounded-[3px] bg-[#7b1fa2] text-[0.8rem]">{t(`status.${status}` as MessageKey)}</span>{/if}
        {#if self.data["confused"]}<span class="px-[0.3rem] rounded-[3px] bg-[#7b1fa2] text-[0.8rem]">{t("status.confusion")}</span>{/if}
      </header>
      <div class={track} role="meter" aria-label={t("hud.hp")} aria-valuemin="0" aria-valuemax={num("hpMax")} aria-valuenow={num("hp")}>
        <span class={fill} style:width="{hpFraction * 100}%" style:background={hpColor(hpFraction)}></span>
      </div>
      <small>{num("hp")} / {num("hpMax")}</small>
    </section>

    <section class="{panel} [grid-area:moves] grid grid-cols-4 gap-2 justify-self-end w-[min(100%,40rem)]">
      {#each SLOTS as slot (slot)}
        {@const move = self.data[`move${slot}`]}
        {#if move !== undefined}
          {@const cd = num(`cd${slot}`)}
          <div class={["relative flex gap-[0.4rem] items-center px-2 py-[0.4rem] rounded-[4px] bg-[color-mix(in_srgb,var(--type)_80%,#000)] [border:2px_solid_var(--type)] overflow-hidden", cd > 0 && "after:absolute after:inset-0 after:content-[''] after:bg-[conic-gradient(rgb(0_0_0/65%)_var(--ring),transparent_0)]"]} style:--type={TYPE_COLORS[(moveType(Number(move)) ?? "normal") as keyof typeof TYPE_COLORS] ?? "#888"} style:--ring="{ring(slot) * 360}deg">
            <Glyph action={`move${slot}` as Action} />
            <span class="overflow-hidden text-ellipsis whitespace-nowrap">{moveName(Number(move))}</span>
            {#if cd > 0}<span class="relative z-1 ml-auto tabular-nums">{(cd * TICK_S).toFixed(1)}s</span>{/if}
          </div>
        {/if}
      {/each}
    </section>
  {/if}

  <section class="{panel} [grid-area:party] justify-self-start flex gap-2" aria-label={t("hud.party")}>
    {#each party as m, i (i)}
      <div class={["grid gap-[0.15rem] w-14 text-[0.75rem]", i === active && "outline-2 outline-solid outline-focus outline-offset-2", m.hp === 0 && "opacity-40"]} title={speciesName(m.species)}>
        <span>{speciesName(m.species).slice(0, 3)}</span>
        <span class={track}><span class={fill} style:width="{(m.hpMax > 0 ? m.hp / m.hpMax : 0) * 100}%" style:background={hpColor(m.hpMax > 0 ? m.hp / m.hpMax : 0)}></span></span>
      </div>
    {/each}
  </section>
</div>
