<script lang="ts">
  // The team at a glance beside the screen: 6 slots with icon, name, level and HP. The Pokémon out
  // (following the trainer, or under control in a fight) is outlined.
  import { t } from "../i18n";
  import PokemonIcon from "./PokemonIcon.svelte";
  import HpBar from "../ui/HpBar.svelte";

  let {
    party,
    out,
    speciesName,
  }: {
    party: { species: number; nickname?: string | undefined; level: number; hp: number; hpMax: number; egg?: true | undefined }[];
    out: number | undefined;
    speciesName: (species: number) => string;
  } = $props();

  const SLOTS = [0, 1, 2, 3, 4, 5] as const;
</script>

<section class="min-h-0 p-3 grid grid-cols-2 grid-rows-3 gap-2 text-[#eef]" aria-label={t("hud.party")}>
  {#each SLOTS as i (i)}
    {@const m = party[i]}
    {#if m}
      {@const f = m.hpMax > 0 ? m.hp / m.hpMax : 0}
      <div class={["grid grid-cols-[auto_1fr] items-center gap-x-2 px-2 rounded-[4px] bg-black/25 min-w-0", i === out && "outline-2 outline-solid outline-focus", m.hp === 0 && "opacity-45"]}>
        <PokemonIcon species={m.species} />
        <div class="grid gap-1 min-w-0">
          <div class="flex gap-2 items-baseline min-w-0">
            <strong class="overflow-hidden text-ellipsis whitespace-nowrap">{m.egg ? t("party.egg") : (m.nickname ?? speciesName(m.species))}</strong>
            <span class="ml-auto text-[0.8rem] text-muted whitespace-nowrap">{t("hud.level", { level: m.level })}</span>
          </div>
          <HpBar fraction={f} role="meter" aria-label={t("hud.hp")} aria-valuemin={0} aria-valuemax={m.hpMax} aria-valuenow={m.hp} />
        </div>
      </div>
    {:else}
      <div class="rounded-[4px] border border-dashed border-white/10" aria-hidden="true"></div>
    {/if}
  {/each}
</section>
