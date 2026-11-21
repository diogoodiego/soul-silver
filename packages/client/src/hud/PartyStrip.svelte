<script lang="ts">
  // Block H: the team in the bottom-left corner. The lead (the one following the trainer, or out in a fight)
  // with its icon, name, level and HP; then a Poké Ball for each of the 6 slots (the bag icon extracted from the
  // ROM, with an HP line under it, greyed when fainted), a dot when empty. Without the atlas: HP-tinted tokens.
  import type { Entity } from "@soulsilver/shared/game";
  import type { Snippet } from "svelte";
  import { hpColor } from "../game/type-colors";
  import { itemIcons, type Frame } from "../game/game-data";
  import PokemonIcon from "../game/PokemonIcon.svelte";
  import { t, type MessageKey } from "../i18n";
  import HpBar from "../ui/HpBar.svelte";

  type Member = { species: number; nickname?: string | undefined; level: number; hp: number; hpMax: number; egg?: true | undefined };
  let {
    party,
    out,
    fight,
    speciesName,
    beside,
  }: {
    party: Member[];
    out: number | undefined;
    /** The Pokémon under control in a fight: the lead card shows its live HP, status and action bar. */
    fight?: Entity | undefined;
    speciesName: (species: number) => string;
    /** Drawn at the end of the slots' row (the ball picker). */
    beside?: Snippet | undefined;
  } = $props();

  const num = (key: string) => Number(fight?.data[key] ?? 0);
  const gauge = $derived(num("gauge"));
  const status = $derived(String(fight?.data["status"] ?? ""));

  const SLOTS = [0, 1, 2, 3, 4, 5] as const;
  const member = $derived(out === undefined ? undefined : party[out]);
  /** In a fight the controlled entity is the source of truth (it updates every tick, the party on save). */
  const lead = $derived<Member | undefined>(
    fight ? { species: num("species"), nickname: member?.species === num("species") ? member.nickname : undefined, level: num("level"), hp: num("hp"), hpMax: num("hpMax") } : member,
  );
  const fraction = (m: Member) => (m.hpMax > 0 ? m.hp / m.hpMax : 0);

  /** Each slot shows the Poké Ball's bag icon (item 4) from the extracted atlas; the HP dot when it is missing. */
  const POKE_BALL = 4;
  let ball = $state<Frame | undefined>();
  void itemIcons().then((map) => (ball = map.get(POKE_BALL)));
</script>

<section class="pointer-events-none grid gap-2 text-white [text-shadow:0_1px_2px_#000]" aria-label={t("hud.party")}>
  {#if lead}
    <div class="grid w-[17rem] grid-cols-[auto_1fr] items-center gap-x-2 rounded-[10px] bg-black/45 px-2 py-1.5 backdrop-blur-[2px]">
      <PokemonIcon species={lead.species} />
      <div class="grid min-w-0 gap-1">
        <div class="flex min-w-0 items-baseline gap-2">
          <strong class="overflow-hidden text-ellipsis whitespace-nowrap">{lead.egg ? t("party.egg") : (lead.nickname ?? speciesName(lead.species))}</strong>
          {#if fight && status}<span class="rounded-[3px] bg-[#7b1fa2] px-[0.3rem] text-[0.75rem]">{t(`status.${status}` as MessageKey)}</span>{/if}
          {#if fight?.data["confused"]}<span class="rounded-[3px] bg-[#7b1fa2] px-[0.3rem] text-[0.75rem]">{t("status.confusion")}</span>{/if}
          <span class="ml-auto whitespace-nowrap text-[0.8rem] opacity-80">{t("hud.level", { level: lead.level })}</span>
        </div>
        <HpBar fraction={fraction(lead)} role="meter" aria-label={t("hud.hp")} aria-valuemin={0} aria-valuemax={lead.hpMax} aria-valuenow={lead.hp} />
        {#if fight}
          <div class="flex items-center gap-2">
            <span class="block h-[0.35rem] flex-1 overflow-hidden rounded-[3px] bg-black/60" role="meter" aria-label={t("hud.gauge")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={gauge}>
              <span class={["block h-full", gauge >= 100 ? "bg-[#ffd54f]" : "bg-[#4fc3f7]"]} style:width="{gauge}%"></span>
            </span>
            <small class="whitespace-nowrap text-[0.75rem]">{lead.hp} / {lead.hpMax}</small>
          </div>
        {/if}
      </div>
    </div>
  {/if}
  <div class="flex w-[17rem] items-center gap-3">
  <ol class="m-0 flex list-none items-center gap-1.5 p-0">
    {#each SLOTS as i (i)}
      {@const m = party[i]}
      <li class="grid w-6 place-items-center" title={m ? (m.egg ? t("party.egg") : (m.nickname ?? speciesName(m.species))) : t("hud.empty")}>
        {#if !m}
          <span class="size-1.5 rounded-full bg-white/50"></span>
          <span class="sr-only">{t("hud.empty")}</span>
        {:else if ball}
          {@const down = m.hp === 0 && !m.egg}
          <span class="grid justify-items-center gap-px">
            <span
              class={["block [image-rendering:pixelated] drop-shadow-[0_1px_1px_#000]", "[zoom:0.75]", i === out && "scale-[1.333]", down && "opacity-50 grayscale"]}
              aria-hidden="true"
              style:width="{ball.w}px"
              style:height="{ball.h}px"
              style:background-image="url({ball.url})"
              style:background-position="-{ball.x}px -{ball.y}px"
            ></span>
            {#if !m.egg}<span class="block h-[2px] w-4 rounded-full" style:background={down ? "#fff4" : hpColor(fraction(m))}></span>{/if}
          </span>
          {#if down}<span class="sr-only">{t("hud.fainted")}</span>{/if}
        {:else if m.hp === 0 && !m.egg}
          <span class="grid size-4 place-items-center rounded-full border-2 border-white/40 bg-black/50 text-[0.6rem] leading-none text-white/70">×</span>
          <span class="sr-only">{t("hud.fainted")}</span>
        {:else}
          <span class={["size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_#0008]", i === out && "size-5"]} style:background={m.egg ? "#e8e2c8" : hpColor(fraction(m))}></span>
        {/if}
      </li>
    {/each}
  </ol>
  {#if beside}<div class="ml-auto">{@render beside()}</div>{/if}
  </div>
</section>
