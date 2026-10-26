<script lang="ts">
  // Bag (spec 017, US5): the original's pockets, switched with the tab actions. Only the potions can
  // be used here for now (the server decides); the rest of the bag comes with spec 24.
  import { POCKET_KEYS, type ItemRecord } from "@soulsilver/shared/game-data";
  import { hpRestore } from "@soulsilver/shared/game";
  import Glyph from "../Glyph.svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import PokemonIcon from "./PokemonIcon.svelte";

  let {
    bag,
    items,
    party,
    itemName,
    speciesName,
    onUse,
    onBack,
  }: {
    bag: { item: number; count: number }[];
    items: Map<number, ItemRecord>;
    party: { species: number; level: number; hp: number; hpMax: number }[];
    itemName: (id: number) => string;
    speciesName: (id: number) => string;
    onUse: (item: number, partyIndex: number) => void;
    onBack: () => void;
  } = $props();

  let pocket = $state<(typeof POCKET_KEYS)[number]>("items");
  /** The potion being used, while choosing who gets it. */
  let using = $state<number | undefined>();
  const inPocket = $derived(bag.filter((b) => (items.get(b.item)?.pocket ?? "items") === pocket));
  const usable = (id: number) => {
    const record = items.get(id);
    return record !== undefined && hpRestore(record) !== undefined;
  };

  function tab(step: number): void {
    pocket = POCKET_KEYS[(POCKET_KEYS.indexOf(pocket) + step + POCKET_KEYS.length) % POCKET_KEYS.length]!;
  }

  function onAction(action: string): boolean {
    if (using !== undefined) return false;
    if (action === "tabPrev") tab(-1);
    else if (action === "tabNext") tab(1);
    else return false;
    return true;
  }
</script>

<section use:menu={{ onBack: () => (using !== undefined ? (using = undefined) : onBack()), onAction }}>
  <h2>{t("bag.title")}</h2>
  {#if using === undefined}
    <div class="flex flex-wrap gap-[0.35rem] items-center mb-3" role="tablist">
      <Glyph action="tabPrev" />
      {#each POCKET_KEYS as key (key)}
        <button type="button" class="aria-selected:bg-accent aria-selected:text-[#111]" role="tab" aria-selected={pocket === key} tabindex="-1" onclick={() => (pocket = key)}>{t(`pocket.${key}`)}</button>
      {/each}
      <Glyph action="tabNext" />
    </div>
    {#if inPocket.length === 0}
      <p>{t("bag.empty")}</p>
    {:else}
      <ul class="list-none p-0 grid gap-[0.35rem] max-w-[30rem]">
        {#each inPocket as b (b.item)}
          <li class="grid gap-[0.1rem]">
            <button type="button" class="flex gap-3 items-center justify-between" disabled={!usable(b.item)} onclick={() => (using = b.item)}>
              <span>{itemName(b.item)}</span>
              <span>×{b.count}</span>
            </button>
            {#if !usable(b.item)}<small class="text-muted">{pocket === "balls" ? t("bag.ballHint") : t("bag.unavailable")}</small>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <p>{t("bag.useOn", { item: itemName(using) })}</p>
    <ul class="list-none p-0 grid gap-[0.35rem] max-w-[30rem]">
      {#each party as m, i (i)}
        <li class="grid gap-[0.1rem]">
          <button
            type="button"
            class="flex gap-3 items-center justify-between"
            disabled={m.hp === 0 || m.hp >= m.hpMax}
            onclick={() => {
              onUse(using!, i);
              using = undefined;
            }}
          >
            <PokemonIcon species={m.species} />
            <span>{speciesName(m.species)}</span>
            <span>{m.hp}/{m.hpMax}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <button type="button" onclick={() => (using !== undefined ? (using = undefined) : onBack())}>{t("common.back")}</button>
</section>
