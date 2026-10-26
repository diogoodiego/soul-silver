<script lang="ts">
  // Pokédex (spec 017, US5): species seen and caught; a caught one shows its entry from the text
  // catalog, a seen one only its name and icon.
  import { screenText } from "@soulsilver/shared/text";
  import { onMount } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import { BANK, bankTexts } from "./game-data";
  import PokemonIcon from "./PokemonIcon.svelte";

  let { seen, caught, speciesName, onBack }: { seen: number[]; caught: number[]; speciesName: (id: number) => string; onBack: () => void } = $props();

  let selected = $state<number | undefined>();
  let entries = $state<Map<number, string>>(new Map());
  let categories = $state<Map<number, string>>(new Map());
  const list = $derived([...seen].sort((a, b) => a - b));
  const isCaught = (id: number) => caught.includes(id);

  onMount(() => {
    void bankTexts(BANK.dexEntries).then((m) => (entries = m));
    void bankTexts(BANK.dexCategories).then((m) => (categories = m));
  });
</script>

<section class="grid grid-cols-[minmax(14rem,20rem)_1fr] gap-x-6 gap-y-2" use:menu={{ onBack: () => (selected !== undefined ? (selected = undefined) : onBack()) }}>
  <h2 class="col-span-full m-0">{t("dex.title")}</h2>
  <p class="col-span-full m-0">{t("dex.counts", { seen: seen.length, caught: caught.length })}</p>
  <ol class="list-none m-0 p-0 max-h-[60vh] overflow-y-auto grid gap-1">
    {#each list as id (id)}
      <li>
        <button type="button" class={["flex gap-[0.6rem] w-full text-left", selected === id && "border-accent"]} onclick={() => (selected = id)} onfocus={() => (selected = id)}>
          <span class="tabular-nums text-muted">{String(id).padStart(3, "0")}</span>
          <span>{speciesName(id)}</span>
          {#if isCaught(id)}<span class="ml-auto text-danger" title={t("dex.caught")}>◓</span>{/if}
        </button>
      </li>
    {/each}
  </ol>
  {#if selected !== undefined}
    <article aria-live="polite">
      <PokemonIcon species={selected} />
      <h3>{String(selected).padStart(3, "0")} {speciesName(selected)}</h3>
      {#if isCaught(selected)}
        {#if categories.get(selected)}<p class="text-muted">{screenText(categories.get(selected)!)}</p>{/if}
        <p>{screenText(entries.get(selected) ?? "")}</p>
      {:else}
        <p class="text-muted">{t("dex.onlySeen")}</p>
      {/if}
    </article>
  {/if}
  <button type="button" class="col-span-full m-0 justify-self-start" onclick={onBack}>{t("common.back")}</button>
</section>
