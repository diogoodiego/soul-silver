// Map grid constants; see specs/006-map-prerender/research.md R0 and R1.

/** Pixels per tile side in every pre-rendered layer. */
export const MAP_TILE_PX = 16;

/** Tiles per piece side (land data permissions are 32 x 32 u16). */
export const PIECE_TILES = 32;

/** Frames of the resampled cycle of a map's animations (specs/006-map-prerender, FR-009). */
export const ANIMATION_FRAMES = 8;
