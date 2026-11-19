<script lang="ts">
  // Block H: the whole current map in the top-right corner, from its collision grid; players are dots, this one
  // ringed. Under it, the species the area's encounter table can give (never where they stand): a black
  // silhouette when the Pokédex does not know the species, its icon when seen, its icon with the Poké Ball's bag
  // icon (extracted; a green tick without the atlas) when caught.
  import type { Entity, WorldMap } from "@soulsilver/shared/game";
  import { MAP_TILE_PX } from "@soulsilver/shared/maps";
  import PokemonIcon from "../game/PokemonIcon.svelte";
  import { itemIcons, type Frame } from "../game/game-data";
  import { t } from "../i18n";
  import { fitMap, routeSpecies, toMinimap, type EncounterTable, type Pokedex } from "./minimap";

  let {
    map,
    level,
    entities,
    selfId,
    encounters,
    dex,
    speciesName,
  }: { map: WorldMap | undefined; level: number; entities: readonly Entity[]; selfId: number | undefined; encounters: EncounterTable | undefined; dex: Pokedex; speciesName: (id: number) => string } = $props();

  const POKE_BALL = 4;
  let ball = $state<Frame | undefined>();
  void itemIcons().then((map) => (ball = map.get(POKE_BALL)));
  const species = $derived(routeSpecies(encounters, dex));

  const BOX_W = 208;
  const BOX_H = 156;
  /** Tile colours by collision category; anything else walkable is ground. */
  const COLOURS: Record<string, string> = { blocked: "#1d2430", tallGrass: "#4c8a3f", water: "#3a6fb0", ledge: "#8a7a55" };
  const GROUND = "#c9c2a6";

  let canvas: HTMLCanvasElement;
  const fit = $derived(map ? fitMap(map.widthPx, map.heightPx, BOX_W, BOX_H) : undefined);
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
  {#each people as p (p.id)}
    <span class={["absolute size-2 -translate-1/2 rounded-full border border-black", p.self ? "size-2.5 bg-white ring-2 ring-[#e8433b]" : "bg-[#7fd0ff]"]} style:left="{p.x}px" style:top="{p.y}px" aria-hidden="true"></span>
  {/each}
  {#if species.length}
    <!-- The route's species, over the map's bottom edge. -->
    <ul class="absolute inset-x-0 bottom-0 m-0 flex list-none flex-wrap justify-center gap-0.5 bg-linear-to-t from-black/70 to-transparent px-1 pb-0.5 pt-3">
      {#each species as s (s.species)}
        {@const label = s.state === "unknown" ? t("hud.minimap.unknown") : speciesName(s.species)}
        <li class="relative grid place-items-center" title={label}>
          <span class={["[zoom:0.8]", s.state === "unknown" ? "[filter:brightness(0)_drop-shadow(0_0_1px_#fff8)]" : "[filter:drop-shadow(0_1px_1px_#000)]"]}>
            <PokemonIcon species={s.species} />
          </span>
          {#if s.state === "caught"}
            {#if ball}
              <span
                class="absolute bottom-0 right-0 block [image-rendering:pixelated] [zoom:0.5] drop-shadow-[0_1px_1px_#000]"
                aria-hidden="true"
                style:width="{ball.w}px"
                style:height="{ball.h}px"
                style:background-image="url({ball.url})"
                style:background-position="-{ball.x}px -{ball.y}px"
              ></span>
            {:else}
              <span class="absolute bottom-0 right-0 grid size-2.5 place-items-center rounded-full border border-white bg-[#2f9e57] text-[0.45rem] leading-none text-white" aria-hidden="true">✓</span>
            {/if}
          {/if}
          <span class="sr-only">{label}{s.state === "caught" ? ` · ${t("hud.minimap.caught")}` : ""}</span>
        </li>
      {/each}
    </ul>
  {/if}
</figure>
