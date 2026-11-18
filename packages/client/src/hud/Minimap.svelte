<script lang="ts">
  // Block H: the whole current map in the top-right corner, from its collision grid, with the wild Pokémon
  // of the area where they stand: a black silhouette when the Pokédex does not know the species, its icon
  // when seen, its icon with a "caught" badge when caught. Players are dots, this one ringed.
  import type { Entity, WorldMap } from "@soulsilver/shared/game";
  import { MAP_TILE_PX } from "@soulsilver/shared/maps";
  import PokemonIcon from "../game/PokemonIcon.svelte";
  import { t } from "../i18n";
  import { fitMap, toMinimap, wildMarkers, type Pokedex } from "./minimap";

  let { map, level, entities, selfId, dex, speciesName }: { map: WorldMap | undefined; level: number; entities: readonly Entity[]; selfId: number | undefined; dex: Pokedex; speciesName: (id: number) => string } = $props();

  const BOX_W = 208;
  const BOX_H = 156;
  /** Tile colours by collision category; anything else walkable is ground. */
  const COLOURS: Record<string, string> = { blocked: "#1d2430", tallGrass: "#4c8a3f", water: "#3a6fb0", ledge: "#8a7a55" };
  const GROUND = "#c9c2a6";

  let canvas: HTMLCanvasElement;
  const fit = $derived(map ? fitMap(map.widthPx, map.heightPx, BOX_W, BOX_H) : undefined);
  const markers = $derived(map && fit ? wildMarkers(entities, map.id, dex, fit) : []);
  const people = $derived(map && fit ? entities.filter((e) => e.kind === "player" && e.area === map.id).map((e) => ({ id: e.id, self: e.id === selfId, ...toMinimap(fit, e.x, e.y) })) : []);

  // The terrain only changes with the map or the level.
  $effect(() => {
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = BOX_W * ratio;
    canvas.height = BOX_H * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, BOX_W, BOX_H);
    if (!map || !fit) return;
    const grid = map.levels[level] ?? map.levels[0];
    if (!grid) return;
    const cell = MAP_TILE_PX * fit.scale;
    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const tile = grid.tiles[ty * grid.width + tx];
        ctx.fillStyle = (tile && COLOURS[tile.category]) ?? GROUND;
        // A hair over a cell, so no seams show between tiles.
        ctx.fillRect(fit.ox + tx * cell, fit.oy + ty * cell, cell + 0.5, cell + 0.5);
      }
    }
  });
</script>

<figure class="pointer-events-none absolute right-4 top-4 z-2 m-0 overflow-hidden rounded-[10px] border-2 border-white/70 bg-black/55 shadow-[0_2px_10px_#0008]" style:width="{BOX_W}px" style:height="{BOX_H}px" aria-label={t("hud.minimap")}>
  <canvas bind:this={canvas} class="absolute inset-0 size-full opacity-85" aria-hidden="true"></canvas>
  {#each markers as m (m.id)}
    <span class="absolute grid -translate-1/2 place-items-center" style:left="{m.x}px" style:top="{m.y}px" title={m.state === "unknown" ? t("hud.minimap.unknown") : speciesName(m.species)}>
      <span class={["[zoom:0.67] [filter:drop-shadow(0_0_1px_#fff)_drop-shadow(0_1px_1px_#000)]", m.state === "unknown" && "[filter:brightness(0)_drop-shadow(0_0_1px_#fff)]"]}>
        <PokemonIcon species={m.species} />
      </span>
      {#if m.state === "caught"}
        <!-- The "caught" badge: a small green disc with a tick, bottom right of the icon. -->
        <span class="absolute -bottom-0.5 -right-0.5 grid size-2.5 place-items-center rounded-full border border-white bg-[#2f9e57] text-[0.45rem] leading-none text-white" aria-hidden="true">✓</span>
      {/if}
      <span class="sr-only">{m.state === "unknown" ? t("hud.minimap.unknown") : speciesName(m.species)}</span>
    </span>
  {/each}
  {#each people as p (p.id)}
    <span class={["absolute size-2 -translate-1/2 rounded-full border border-black", p.self ? "size-2.5 bg-white ring-2 ring-[#e8433b]" : "bg-[#7fd0ff]"]} style:left="{p.x}px" style:top="{p.y}px" aria-hidden="true"></span>
  {/each}
</figure>
