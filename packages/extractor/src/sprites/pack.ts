// Deterministic shelf packer for atlas pages (research.md R2).

export interface PackItem {
  name: string;
  w: number;
  h: number;
}

export interface Placement {
  page: number;
  x: number;
  y: number;
}

export interface Packed {
  pages: { width: number; height: number }[];
  placements: Map<string, Placement>;
}

export class PackError extends Error {
  override name = "PackError";
}

/** Tallest first, ties by name, so the same items always give the same layout. */
export function packFrames(items: readonly PackItem[], maxSize: number): Packed {
  for (const item of items) {
    if (item.w > maxSize || item.h > maxSize) throw new PackError(`Frame ${item.name} (${item.w}x${item.h}) does not fit a ${maxSize}px page`);
  }
  const sorted = [...items].sort((a, b) => b.h - a.h || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const pages: { width: number; height: number }[] = [];
  const placements = new Map<string, Placement>();
  let shelfX = 0;
  let shelfY = 0;
  let shelfH = 0;
  let page = -1;
  const open = () => {
    pages.push({ width: 0, height: 0 });
    page++;
    shelfX = shelfY = shelfH = 0;
  };
  for (const item of sorted) {
    if (page < 0) open();
    if (shelfX + item.w > maxSize) {
      shelfY += shelfH;
      shelfX = 0;
      shelfH = 0;
    }
    if (shelfY + item.h > maxSize) {
      open();
    }
    placements.set(item.name, { page, x: shelfX, y: shelfY });
    const p = pages[page]!;
    shelfX += item.w;
    shelfH = Math.max(shelfH, item.h);
    p.width = Math.max(p.width, shelfX);
    p.height = Math.max(p.height, shelfY + item.h);
  }
  return { pages, placements };
}
