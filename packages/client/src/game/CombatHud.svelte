<script lang="ts">
  // Combat HUD (spec 017, US3): HP, level and status of the Pokémon under control, and an HP bar over
  // each foe. The moves and the party live in the side panel next to the screen.
  import type { Entity } from "@soulsilver/shared/game";
  import { t, type MessageKey } from "../i18n";
  import HpBar from "../ui/HpBar.svelte";

  let {
    self,
    bars,
    speciesName,
  }: {
    /** The Pokémon the player controls, or undefined between swaps. */
    self: Entity | undefined;
    /** HP bars over the foes (wild and other players'), in screen pixels. */
    bars: { key: string; x: number; y: number; fraction: number }[];
    speciesName: (species: number) => string;
  } = $props();

  const num = (key: string) => Number(self?.data[key] ?? 0);
  const hpFraction = $derived(num("hpMax") > 0 ? num("hp") / num("hpMax") : 0);
  const status = $derived(String(self?.data["status"] ?? ""));
</script>

{#each bars as b (b.key)}
  <HpBar fraction={b.fraction} class="absolute w-14 -translate-x-1/2 -translate-y-full pointer-events-none z-1" style="left: {b.x}px; top: {b.y}px" aria-hidden="true" />
{/each}

{#if self}
  <section class="absolute left-3 bottom-3 w-[min(calc(100%-1.5rem),18rem)] px-3 py-2 bg-panel rounded-[6px] pointer-events-none z-2 text-white [text-shadow:0_1px_2px_#000]" aria-label={t("hud.label")}>
    <header class="flex gap-2 items-baseline">
      <strong>{speciesName(num("species"))}</strong>
      <span>{t("hud.level", { level: num("level") })}</span>
      {#if status}<span class="px-[0.3rem] rounded-[3px] bg-[#7b1fa2] text-[0.8rem]">{t(`status.${status}` as MessageKey)}</span>{/if}
      {#if self.data["confused"]}<span class="px-[0.3rem] rounded-[3px] bg-[#7b1fa2] text-[0.8rem]">{t("status.confusion")}</span>{/if}
    </header>
    <HpBar fraction={hpFraction} role="meter" aria-label={t("hud.hp")} aria-valuemin={0} aria-valuemax={num("hpMax")} aria-valuenow={num("hp")} />
    <small>{num("hp")} / {num("hpMax")}</small>
  </section>
{/if}
