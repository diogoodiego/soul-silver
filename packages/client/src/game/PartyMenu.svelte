<script lang="ts">
  // Party (spec 017, US5): the 6 members, a summary of each (stats, moves, nature, ability, XP) and
  // reordering. The server applies the new order; nothing moves here until it confirms.
  import type { ServerMessage } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import PokemonIcon from "./PokemonIcon.svelte";

  type Member = Extract<ServerMessage, { type: "party" }>["members"][number];

  let {
    party,
    speciesName,
    moveName,
    natureName,
    abilityName,
    itemName,
    onReorder,
    onBack,
  }: {
    party: Member[];
    speciesName: (id: number) => string;
    moveName: (id: number) => string;
    natureName: (id: number) => string;
    abilityName: (id: number) => string;
    /** Spec 027: the held item's name. */
    itemName?: ((id: number) => string) | undefined;
    onReorder: (from: number, to: number) => void;
    onBack: () => void;
  } = $props();

  let selected = $state(0);
  /** The member picked up to move, while choosing where it goes. */
  let moving = $state<number | undefined>();
  const STATS = ["hp", "attack", "defense", "specialAttack", "specialDefense", "speed"] as const;
  const member = $derived(party[selected]);

  function pick(i: number): void {
    if (moving === undefined) {
      selected = i;
      return;
    }
    if (moving !== i) onReorder(moving, i);
    moving = undefined;
    selected = i;
  }
</script>

<section class="grid grid-cols-[minmax(14rem,22rem)_1fr] gap-x-6 gap-y-2" use:menu={{ onBack: () => (moving !== undefined ? (moving = undefined) : onBack()) }}>
  <h2 class="col-span-full m-0">{t("party.title")}</h2>
  <ol class="list-none m-0 p-0 grid content-start gap-[0.35rem]">
    {#each party as m, i (i)}
      <li>
        <button type="button" class={["grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center w-full text-left", i === selected && "border-accent", i === moving && "outline-2 outline-dashed outline-focus"]} onclick={() => pick(i)} onfocus={() => moving === undefined && (selected = i)}>
          <PokemonIcon species={m.species} />
          <span>{m.nickname ?? speciesName(m.species)}</span>
          <span>{t("hud.level", { level: m.level })}</span>
          <span class={[m.hp === 0 && "text-danger"]}>{m.hp}/{m.hpMax}</span>
        </button>
      </li>
    {/each}
  </ol>

  {#if member}
    <article aria-live="polite">
      <h3>{member.nickname ?? speciesName(member.species)} · {t("hud.level", { level: member.level })}</h3>
      {#if member.stats}
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-[0.15rem] mt-0 mx-0 mb-2">
          {#each STATS as k (k)}
            <dt>{t(`stat.${k}`)}</dt>
            <dd class="m-0">{k === "hp" ? `${member.hp}/${member.stats.hp}` : member.stats[k]}</dd>
          {/each}
        </dl>
      {/if}
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-[0.15rem] mt-0 mx-0 mb-2">
        {#if member.nature !== undefined}<dt>{t("party.nature")}</dt><dd class="m-0">{natureName(member.nature)}</dd>{/if}
        {#if member.ability !== undefined}<dt>{t("party.ability")}</dt><dd class="m-0">{abilityName(member.ability)}</dd>{/if}
        {#if member.held !== undefined && itemName}<dt>{t("party.held")}</dt><dd class="m-0">{itemName(member.held)}</dd>{/if}
        {#if member.exp !== undefined}
          <dt>{t("party.exp")}</dt>
          <dd class="m-0">{member.exp}{#if member.expNext !== undefined && member.expNext > member.exp}&nbsp;({t("party.toNext", { n: member.expNext - member.exp })}){/if}</dd>
        {/if}
      </dl>
      {#if member.moves}
        <h4>{t("party.moves")}</h4>
        <ul>
          {#each member.moves as move, i (move)}<li>{moveName(move)}{#if member.ppUps?.[i]}&nbsp;+{member.ppUps[i]}{/if}</li>{/each}
        </ul>
      {/if}
    </article>
  {/if}

  <div class="col-span-full m-0 flex gap-2">
    {#if party.length > 1}
      <button type="button" onclick={() => (moving = moving === undefined ? selected : undefined)}>{moving === undefined ? t("party.move") : t("party.cancelMove")}</button>
    {/if}
    <button type="button" onclick={onBack}>{t("common.back")}</button>
  </div>
  {#if moving !== undefined}<p class="col-span-full m-0" role="status">{t("party.moveHint", { name: speciesName(party[moving]?.species ?? 0) })}</p>{/if}
</section>
