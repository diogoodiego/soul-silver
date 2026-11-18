<script lang="ts">
  // Fly's destinations (spec 025, FR-015): only the fly points this player has visited, as the server
  // sent them.
  // shortcut: a list of names, not the Pokégear town map; draw the map once its graphics are extracted.
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let { points, onFly, onBack }: { points: { area: string; name: string }[]; onFly: (area: string) => void; onBack: () => void } = $props();
</script>

<div class="fixed inset-0 grid place-items-center bg-black/55 z-10">
  <section class="grid gap-2 min-w-[16rem] px-5 py-4 bg-panel border-2 border-accent rounded-[6px]" aria-label={t("fly.title")} use:menu={{ onBack }}>
    <h2 class="m-0">{t("fly.title")}</h2>
    {#each points as p (p.area)}
      <button type="button" onclick={() => onFly(p.area)}>{p.name}</button>
    {:else}
      <p class="m-0">{t("fly.none")}</p>
    {/each}
    <button type="button" onclick={onBack}>{t("common.back")}</button>
  </section>
</div>
