type Point = readonly [number, number];

/**
 * CSS matrix3d (column-major, transform-origin 0 0) that lays a w×h element exactly onto a quad on
 * screen: corners top-left, top-right, bottom-right, bottom-left. A projective map, so an element
 * drawn over a tilted 3D panel keeps its perspective.
 */
export function quadTransform(w: number, h: number, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: readonly [Point, Point, Point, Point]): number[] {
  // Unit square -> quad (Heckbert's square-to-quad).
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = det === 0 ? 0 : (dx3 * dy2 - dx2 * dy3) / det;
  const k = det === 0 ? 0 : (dx1 * dy3 - dx3 * dy1) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  // Element pixels -> unit square first.
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1];
}
