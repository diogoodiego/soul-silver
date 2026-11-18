// Block H: the minimap's geometry and markers. The whole current map is fitted into the box (keeping its
// aspect, centred); each wild Pokémon of the area becomes a marker drawn by what the Pokédex knows of it.

export type DexState = "unknown" | "seen" | "caught";

export interface Pokedex {
  seen: readonly number[];
  caught: readonly number[];
}

/** Caught first: a caught species is always seen too. */
export function dexState(species: number, dex: Pokedex): DexState {
  if (dex.caught.includes(species)) return "caught";
  return dex.seen.includes(species) ? "seen" : "unknown";
}

/** Where the map lands in the box: map pixels times `scale`, offset by `ox`, `oy`; `w` × `h` is the map's drawn size. */
export interface MinimapFit {
  scale: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export function fitMap(mapW: number, mapH: number, boxW: number, boxH: number): MinimapFit {
  const scale = Math.min(boxW / Math.max(1, mapW), boxH / Math.max(1, mapH));
  const w = mapW * scale;
  const h = mapH * scale;
  return { scale, ox: (boxW - w) / 2, oy: (boxH - h) / 2, w, h };
}

export function toMinimap(fit: MinimapFit, x: number, y: number): { x: number; y: number } {
  return { x: fit.ox + x * fit.scale, y: fit.oy + y * fit.scale };
}

interface EntityLike {
  id: number;
  kind: string;
  area: string;
  x: number;
  y: number;
  data: Record<string, unknown>;
}

export interface WildMarker {
  id: number;
  species: number;
  state: DexState;
  x: number;
  y: number;
}

/** The wild Pokémon of `area` (not a trainer's or a player's), placed in the box. */
export function wildMarkers(entities: readonly EntityLike[], area: string, dex: Pokedex, fit: MinimapFit): WildMarker[] {
  const markers: WildMarker[] = [];
  for (const e of entities) {
    const species = e.data["species"];
    if (e.kind !== "pokemon" || e.area !== area || e.data["owner"] !== "wild" || typeof species !== "number") continue;
    markers.push({ id: e.id, species, state: dexState(species, dex), ...toMinimap(fit, e.x, e.y) });
  }
  return markers;
}
