<script lang="ts">
  // The Pokégear map (spec 026, FR-008): where the player is, the places they visited (their fly points) and where
  // the others of the session stand, drawn from the maps' own layout (gear/region.ts) and listed by name.
  // shortcut: plain rectangles, not the Pokégear's town map art; use it once its graphics are extracted.
  import { t } from "../i18n";
  import type { regionView } from "./region";

  let { here, visited, others, region }: { here: string; visited: string[]; others: { name: string; place: string }[]; region: ReturnType<typeof regionView> } = $props();
</script>

<div class="grid gap-2">
  {#if region.viewBox}
    <svg class="w-full max-h-[30vh] bg-[#1d2a44] rounded" viewBox={region.viewBox} role="img" aria-label={t("gear.map")}>
      {#each region.rects as r (r.name + r.x + r.y)}
        <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.here ? "#4a7bd0" : "#3c5a3c"} stroke="#cfe" stroke-width="0.05"><title>{r.name}</title></rect>
      {/each}
      {#each region.dots as d (d.name)}
        <circle cx={d.x} cy={d.y} r="0.2" fill={d.self ? "#ffd84a" : "#ff6a6a"} stroke="#000" stroke-width="0.04"><title>{d.name}</title></circle>
      {/each}
    </svg>
  {/if}
  <p class="m-0">{t("gear.here", { place: here })}</p>
  <h3 class="m-0 text-[1rem]">{t("gear.visited")}</h3>
  <ul class="m-0 pl-5">
    {#each visited as place (place)}<li>{place}</li>{:else}<li>{t("gear.none")}</li>{/each}
  </ul>
  <h3 class="m-0 text-[1rem]">{t("gear.others")}</h3>
  <ul class="m-0 pl-5">
    {#each others as o (o.name)}<li>{o.name} — {o.place}</li>{:else}<li>{t("gear.alone")}</li>{/each}
  </ul>
</div>
