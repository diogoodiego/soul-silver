<script lang="ts">
  // The starter scene (spec 024), after the original's: three Poké Balls on Elm's machine; the one
  // in focus shows the Pokémon inside, its name and types; picking it asks to confirm.
  import Button from "../ui/Button.svelte";
  import { t, type MessageKey } from "../i18n";
  import { menu } from "../input/menu";
  import { pokemonFronts, speciesTypes } from "./game-data";
  import { TYPE_COLORS } from "./type-colors";

  let { species, speciesName, onPick }: { species: number[]; speciesName: (id: number) => string; onPick: (index: number) => void } = $props();

  let focused = $state(0);
  let asking = $state<number | undefined>();
  let fronts = $state<Awaited<ReturnType<typeof pokemonFronts>>>(new Map());
  let types = $state<Awaited<ReturnType<typeof speciesTypes>>>(new Map());
  $effect(() => {
    void pokemonFronts().then((m) => (fronts = m));
    void speciesTypes().then((m) => (types = m));
  });

  /** The yes button takes the focus as the question opens, as the dialog box does. */
  const focusNow = (node: HTMLElement) => node.focus();

  const shown = $derived(species[asking ?? focused]);
  const front = $derived(shown === undefined ? undefined : fronts.get(shown));
</script>

<section
  class="absolute inset-0 z-4 grid grid-rows-[1fr_auto] bg-[radial-gradient(circle_at_50%_40%,#5b6b7a,#1c232b)] text-primary"
  aria-label={t("starter.title")}
  use:menu={{ onBack: () => (asking = undefined) }}
>
  <div class="grid place-items-center gap-3 p-4">
    <div class="grid place-items-center h-28" aria-live="polite">
      {#if shown !== undefined}
        {#if front}
          <span
            class="block [image-rendering:pixelated] [zoom:1.5]"
            aria-hidden="true"
            style:width="{front.w}px"
            style:height="{front.h}px"
            style:background-image="url({front.url})"
            style:background-position="-{front.x}px -{front.y}px"
          ></span>
        {/if}
        <p class="m-0 font-bold">{speciesName(shown)}</p>
        <p class="m-0 flex gap-1">
          {#each types.get(shown) ?? [] as key (key)}
            <span class="px-2 rounded text-xs uppercase" style:background={TYPE_COLORS[key] ?? "#888"}>{t(`type.${key}` as MessageKey)}</span>
          {/each}
        </p>
      {/if}
    </div>
    <!-- The machine: two balls on top, one below, as on the DS screen. -->
    <div class="grid grid-cols-2 gap-x-10 gap-y-2 p-5 rounded-full bg-[#2e4a5a] border-4 border-[#9bb]">
      {#each species as id, i (id)}
        <Button
          variant="bare"
          class="size-14 rounded-full border-4 border-[#222] bg-[linear-gradient(#e33_0_45%,#222_45%_55%,#eee_55%)] focus:outline-4 focus:outline-solid focus:outline-[#ffd54a] {i === 2 ? 'col-span-2 justify-self-center' : ''}"
          aria-label={speciesName(id)}
          disabled={asking !== undefined}
          onfocus={() => (focused = i)}
          onmouseenter={() => (focused = i)}
          onclick={() => (asking = i)}
        ></Button>
      {/each}
    </div>
  </div>
  <div class="m-3 px-4 py-3 bg-surface-overlay text-primary border-3 border-frame rounded-[6px] text-lg leading-[1.5]">
    {#if asking === undefined}
      <p class="m-0">{t("starter.touch")}</p>
    {:else}
      <p class="m-0">{t("script.starter", { name: speciesName(species[asking]!) })}</p>
      <div class="flex gap-2 mt-2">
        <Button {@attach focusNow} onclick={() => onPick(asking!)}>{t("common.yes")}</Button>
        <Button onclick={() => (asking = undefined)}>{t("common.no")}</Button>
      </div>
    {/if}
  </div>
</section>
