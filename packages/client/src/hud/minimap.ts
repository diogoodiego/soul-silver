// Block H: the minimap's geometry and markers. The whole current map is fitted into the box (keeping its
// aspect, centred); under it, the species the map's encounter table can give, by what the Pokédex knows of them.

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

type Slots = readonly { species: number }[];

/** The parts of an encounter table the minimap reads. */
export interface EncounterTable {
  grass?: { morning: Slots; day: Slots; night: Slots } | undefined;
  surf?: Slots | undefined;
  rockSmash?: Slots | undefined;
  oldRod?: Slots | undefined;
  goodRod?: Slots | undefined;
  superRod?: Slots | undefined;
}

/** Every species the map's encounter table can give (grass at any hour, surf, Rock Smash, rods), once each, in table order. */
export function routeSpecies(table: EncounterTable | undefined, dex: Pokedex): { species: number; state: DexState }[] {
  if (!table) return [];
  const all = [table.grass?.morning, table.grass?.day, table.grass?.night, table.surf, table.rockSmash, table.oldRod, table.goodRod, table.superRod].flatMap((s) => s ?? []);
  const unique = [...new Set(all.map((s) => s.species).filter((id) => id > 0))];
  return unique.map((species) => ({ species, state: dexState(species, dex) }));
}
