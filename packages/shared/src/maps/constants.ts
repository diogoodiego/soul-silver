// Map grid constants; see specs/006-map-prerender/research.md R0 and R1.

/** Pixels per tile side (and pixels per tile in map meshes). */
export const MAP_TILE_PX = 16;

/** Tiles per piece side (land data permissions are 32 x 32 u16). */
export const PIECE_TILES = 32;

/**
 * Map animations play on one clock of game frames ("ticks"), each at its own ROM duration, sampled
 * every ANIMATION_STEP_TICKS: frame k of an animated group is tick k * ANIMATION_STEP_TICKS.
 * shortcut: 30 ticks per second is assumed (the 3D field runs at 30 fps); tune here if it looks off.
 */
export const ANIMATION_TICKS_PER_SECOND = 30;
export const ANIMATION_STEP_TICKS = 2;
/** Milliseconds between two frames of an animated group. */
export const ANIMATION_FRAME_MS = (1000 * ANIMATION_STEP_TICKS) / ANIMATION_TICKS_PER_SECOND;
