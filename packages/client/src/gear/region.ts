// The Pokégear's region map (spec 026, FR-008), laid out from the maps' own matrix cells (map-areas).
import { MAP_TILE_PX, PIECE_TILES } from "@soulsilver/shared/maps";

/** A map's rectangle in matrix cells. */
export interface Extent {
  x: number;
  z: number;
  w: number;
  h: number;
}

const CELL_PX = PIECE_TILES * MAP_TILE_PX;
const MARGIN = 0.5;

/** Rectangles and dots in cells, and the viewBox that frames them (undefined when there is nothing). */
export function regionView(places: { name: string; extent: Extent; here: boolean }[], players: { name: string; extent: Extent; x: number; y: number; self: boolean }[]) {
  const rects = places.map((p) => ({ name: p.name, x: p.extent.x, y: p.extent.z, w: p.extent.w, h: p.extent.h, here: p.here }));
  const dots = players.map((p) => ({ name: p.name, x: p.extent.x + p.x / CELL_PX, y: p.extent.z + p.y / CELL_PX, self: p.self }));
  if (!rects.length) return { rects, dots, viewBox: undefined };
  const x0 = Math.min(...rects.map((r) => r.x)) - MARGIN;
  const y0 = Math.min(...rects.map((r) => r.y)) - MARGIN;
  const x1 = Math.max(...rects.map((r) => r.x + r.w)) + MARGIN;
  const y1 = Math.max(...rects.map((r) => r.y + r.h)) + MARGIN;
  return { rects, dots, viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}` };
}
