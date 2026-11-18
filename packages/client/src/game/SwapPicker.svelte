<script lang="ts">
  // Quick swap (spec 014, US3): the only menu in combat. Opens with the picker action or when the
  // Pokémon out faints; lists the party in its own order (swapping never reorders it).
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  interface Member {
    species: number;
    nickname?: string | undefined;
    level: number;
    hp: number;
    hpMax: number;
    egg?: true | undefined;
  }

  let {
    members,
    launchable,
    active,
    fainted,
    speciesName,
    onPick,
    onRecall,
    onClose,
  }: {
    members: Member[];
    /** While surfing (spec 025): false for the members that cannot fight on the water. */
    launchable?: boolean[] | undefined;
    active: number | undefined;
    /** Opened because the Pokémon out fainted: there is nothing to close back to. */
    fainted: boolean;
    speciesName: (species: number) => string;
    onPick: (index: number) => void;
    onRecall: () => void;
    onClose: () => void;
  } = $props();

</script>

<div class="absolute left-1/2 bottom-4 -translate-x-1/2 grid gap-1 p-3 bg-black/85 text-white text-[13px]" role="dialog" aria-label={t("swap.title")} use:menu={{ onBack: () => !fainted && onClose() }}>
  <p class="mt-0 mb-1">{fainted ? t("swap.fainted") : t("swap.title")}</p>
  {#each members as m, i (i)}
    <button type="button" class="text-left" disabled={m.egg || m.hp === 0 || i === active || launchable?.[i] === false} onclick={() => onPick(i)}>
      {t("swap.member", { name: m.egg ? t("party.egg") : (m.nickname ?? speciesName(m.species)), level: m.level, hp: m.hp, hpMax: m.hpMax })}{i === active ? t("swap.out") : ""}{m.hp === 0 ? t("swap.faintedTag") : ""}{launchable?.[i] === false ? t("swap.landTag") : ""}
    </button>
  {/each}
  <button type="button" class="text-left" onclick={onRecall}>{t("swap.recall")}</button>
  {#if !fainted}<button type="button" class="text-left" onclick={onClose}>{t("swap.back")}</button>{/if}
</div>
