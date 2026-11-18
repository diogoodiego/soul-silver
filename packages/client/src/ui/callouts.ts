/**
 * Tops for a column of labels, each wanting to sit at its anchor's y: none overlaps the one above it
 * (with `gap` between), and the column stays between `top` and `bottom`. Returned in the input's order.
 */
export function spread(items: readonly { y: number; h: number }[], top: number, bottom: number, gap = 4): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a]!.y - items[b]!.y);
  const ys: number[] = [];
  let next = top;
  for (const i of order) {
    ys[i] = Math.max(items[i]!.y, next);
    next = ys[i] + items[i]!.h + gap;
  }
  // Past the bottom: walk back up from the last label.
  let limit = bottom;
  for (const i of [...order].reverse()) {
    ys[i] = Math.max(top, Math.min(ys[i]!, limit - items[i]!.h));
    limit = ys[i] - gap;
  }
  return ys;
}
