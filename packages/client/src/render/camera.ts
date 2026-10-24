// Fixed internal resolution (the DS screen) and the camera over it (spec 011, FR-009 and FR-012).

export const VIEW_W = 256;
export const VIEW_H = 192;

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
export function clampCamera(fx: number, fy: number, bounds: Bounds): { x: number; y: number } {
  return { x: clampAxis(fx, bounds.left, bounds.right, VIEW_W), y: clampAxis(fy, bounds.top, bounds.bottom, VIEW_H) };
}

/** Largest whole scale that fits the window, and the bars around it. */
export function integerScale(width: number, height: number): { scale: number; left: number; top: number } {
  const scale = Math.max(1, Math.floor(Math.min(width / VIEW_W, height / VIEW_H)));
  return { scale, left: Math.floor((width - scale * VIEW_W) / 2), top: Math.floor((height - scale * VIEW_H) / 2) };
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
export function obliqueProjection(left: number, top: number): number[] {
  const middle = OBLIQUE * (top + VIEW_H / 2);
  return [
    2 / VIEW_W, 0, 0, (-2 * left) / VIEW_W - 1,
    0, (2 * OBLIQUE) / VIEW_H, -2 / VIEW_H, (2 * top) / VIEW_H + 1,
    0, -1 / DEPTH_RANGE, -OBLIQUE / DEPTH_RANGE, middle / DEPTH_RANGE,
    0, 0, 0, 1,
  ];
}
