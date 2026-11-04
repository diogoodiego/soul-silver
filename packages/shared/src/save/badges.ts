/** How many badges a badge set holds (bit i is badge i). */
export function badgeCount(set: number): number {
  let n = 0;
  for (let s = set; s; s &= s - 1) n++;
  return n;
}

export const hasBadgeBit = (set: number, badge: number): boolean => badge >= 0 && badge < 16 && (set & (1 << badge)) !== 0;
