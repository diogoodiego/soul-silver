// The DS screen as the smallest view, and the camera over it (spec 011, FR-009 and FR-012).

export const VIEW_W = 256;
export const VIEW_H = 192;

/** World pixels on screen. */
export interface ViewSize {
  w: number;
  h: number;
}
const DS_VIEW: ViewSize = { w: VIEW_W, h: VIEW_H };

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function clampAxis(focus: number, min: number, max: number, size: number): number {
  if (max - min <= size) return Math.round(min - (size - (max - min)) / 2);
  return Math.round(Math.min(Math.max(focus - size / 2, min), max - size));
}

/** Top-left of the view, following the focus and never showing past the bounds. */
export function clampCamera(fx: number, fy: number, bounds: Bounds, view: ViewSize = DS_VIEW): { x: number; y: number } {
  return { x: clampAxis(fx, bounds.left, bounds.right, view.w), y: clampAxis(fy, bounds.top, bounds.bottom, view.h) };
}

/**
 * Fills the box with no bars: the largest whole scale at which the DS screen fits, and the view that
 * covers the box at that scale (at least the DS screen; the last world pixel may be cut by under `scale`).
 */
export function fillView(width: number, height: number): ViewSize & { scale: number } {
  const scale = Math.max(1, Math.floor(Math.min(width / VIEW_W, height / VIEW_H)));
  return { scale, w: Math.max(VIEW_W, Math.ceil(width / scale)), h: Math.max(VIEW_H, Math.ceil(height / scale)) };
}

/** Screen pixels up per pixel of height: the DS-like oblique view, where ground keeps its grid. */
export const OBLIQUE = 0.75;
/** Pixels of depth mapped over the clip range, around the middle of the view. */
const DEPTH_RANGE = 2048;

/**
 * Row-major 4x4 from world pixels (x east, y up, z south) to clip space, for a view whose top-left
 * ground point is (left, top). Screen y is z - OBLIQUE * y; depth grows with y + OBLIQUE * z, so what
 * is higher or further south is nearer, and a standing (constant z) sprite is occluded like the DS.
 */
export function obliqueProjection(left: number, top: number, { w, h }: ViewSize = DS_VIEW): number[] {
  const middle = OBLIQUE * (top + h / 2);
  return [
    2 / w, 0, 0, (-2 * left) / w - 1,
    0, (2 * OBLIQUE) / h, -2 / h, (2 * top) / h + 1,
    0, -1 / DEPTH_RANGE, -OBLIQUE / DEPTH_RANGE, middle / DEPTH_RANGE,
    0, 0, 0, 1,
  ];
}
