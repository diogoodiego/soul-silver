<script lang="ts">
  // The Pokégear radio (spec 026): Johto's stations and what each plays now; the tuned show's lines are the
  // original texts of its bank, in order. Pokémon Music's March and Lullaby change the spawns around the player.
  import Button from "../ui/Button.svelte";
  import { t } from "../i18n";

  let { stations, tuned, lines, onTune }: { stations: { id: string; title: string }[]; tuned: string | null; lines: string[]; onTune: (id: string | null) => void } = $props();
</script>

<div class="grid gap-2">
  <div class="flex flex-wrap gap-2">
    {#each stations as s (s.id)}
      <Button aria-pressed={tuned === s.id} onclick={() => onTune(s.id)}>{s.title}</Button>
    {/each}
    <Button onclick={() => onTune(null)}>{t("radio.off")}</Button>
  </div>
  {#if tuned}
    <ol class="m-0 pl-5 max-h-[40vh] overflow-y-auto grid gap-1">
      {#each lines as line, i (i)}<li>{line}</li>{/each}
    </ol>
  {:else}
    <p class="m-0">{t("radio.silent")}</p>
  {/if}
</div>
