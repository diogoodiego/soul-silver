<script lang="ts">
  // New game in the chosen slot: name, character and starter (spec 012 US1, spec 017 US2).
  import { PLAYER_NAME_MAX } from "@soulsilver/shared/game";
  import { STARTERS } from "@soulsilver/shared/progression";
  import { onMount } from "svelte";
  import { BANK, bankTexts } from "./game/game-data";
  import PokemonIcon from "./game/PokemonIcon.svelte";
  import { t } from "./i18n";
  import { activeDevice } from "./input/input";
  import { menu } from "./input/menu";
  import NameKeyboard from "./NameKeyboard.svelte";

  let { slot, overwrite, onCreated, onBack }: { slot: number; overwrite: boolean; onCreated: (slot: number) => void; onBack: () => void } = $props();

  let name = $state("");
  let character = $state<"male" | "female">("male");
  let starter = $state<number | undefined>();
  let speciesNames = $state<Map<number, string>>(new Map());
  onMount(() => {
    void bankTexts(BANK.species).then((m) => (speciesNames = m));
  });
  let error = $state<string | undefined>();
  let busy = $state(false);

  async function create(): Promise<void> {
    error = undefined;
    if (name.trim().length === 0) {
      error = t("newGame.nameRequired");
      return;
    }
    if (starter === undefined) {
      error = t("newGame.starterRequired");
      return;
    }
    busy = true;
    const result = await window.soulSilver.createSave(slot, name, character, overwrite, starter);
    busy = false;
    if (result.ok) onCreated(slot);
    else error = result.reason;
  }
</script>

<form class="grid gap-3 max-w-[24rem]"
  use:menu={{ onBack }}
  onsubmit={(event) => {
    event.preventDefault();
    void create();
  }}
>
  <h2>{t("newGame.title", { slot })}</h2>

  <label class="grid gap-1">
    {t("newGame.name")}
    <input bind:value={name} maxlength={PLAYER_NAME_MAX} autocomplete="off" required tabindex={$activeDevice === "gamepad" ? -1 : 0} />
  </label>
  {#if $activeDevice === "gamepad"}
    <NameKeyboard value={name} max={PLAYER_NAME_MAX} onChange={(next: string) => (name = next)} />
  {/if}

  <fieldset class="flex gap-2 border-none p-0">
    <legend>{t("newGame.character")}</legend>
    <button type="button" class="aria-pressed:outline-2 aria-pressed:outline-solid aria-pressed:outline-accent" aria-pressed={character === "male"} onclick={() => (character = "male")}>{t("newGame.male")}</button>
    <button type="button" class="aria-pressed:outline-2 aria-pressed:outline-solid aria-pressed:outline-accent" aria-pressed={character === "female"} onclick={() => (character = "female")}>{t("newGame.female")}</button>
  </fieldset>

  <fieldset class="flex gap-2 border-none p-0">
    <legend>{t("newGame.starter")}</legend>
    {#each STARTERS as id (id)}
      <button type="button" class="inline-flex gap-[0.4rem] items-center aria-pressed:outline-2 aria-pressed:outline-solid aria-pressed:outline-accent" aria-pressed={starter === id} onclick={() => (starter = id)}>
        <PokemonIcon species={id} />
        {speciesNames.get(id) ?? `#${id}`}
      </button>
    {/each}
  </fieldset>

  {#if error}<p class="text-danger m-0" role="alert">{error}</p>{/if}

  <div class="flex gap-2">
    <button type="submit" disabled={busy}>{t("newGame.start")}</button>
    <button type="button" onclick={onBack}>{t("common.back")}</button>
  </div>
</form>
