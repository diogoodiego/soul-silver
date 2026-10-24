import { classifyPermission, MAP_FORMAT_VERSION, type CollisionCell, type MapCollisionFile } from "@soulsilver/shared/maps";
import { mapGrid, type MapCell } from "./scene.ts";

// Collision per level (research.md R5, R6). The ROM has one permission grid per piece:
// level 0 classifies every tile; level L >= 1 shares it, and its deck tiles (those with a
// surface L) are the bridge. A single-surface tile next to a deck, at the deck's height and
// not at the height below it, is the way onto the bridge: a transition, both ways.

export interface CollisionWarning {
  code: "ambiguous-height" | "unknown-permission";
  detail: string;
}

const SAME_HEIGHT = 2;
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function buildCollision(map: number, cells: MapCell[]): { levels: MapCollisionFile[]; warnings: CollisionWarning[] } {
  const grid = mapGrid(cells);
  const { width, height } = grid;
  const surfaces = (tx: number, tz: number) => {
    const at = tx >= 0 && tz >= 0 && tx < width && tz < height ? grid.tile(tx, tz) : undefined;
    return at ? at.piece.tileHeights[at.index]! : [];
  };

  const base: CollisionCell[] = [];
  const unknown = new Set<number>();
  let ambiguous = 0;
  let levelCount = 1;
  for (let tz = 0; tz < height; tz++) {
    for (let tx = 0; tx < width; tx++) {
      const at = grid.tile(tx, tz);
      const cell = classifyPermission(at ? at.piece.permissions[at.index]! : 0x8000);
      if (cell.category === "special") unknown.add(cell.raw & 0xff);
      base.push(cell);
      const count = surfaces(tx, tz).length;
      levelCount = Math.max(levelCount, count);
      if (count > 2) ambiguous++;
    }
  }

  // The oblique camera draws buildings and trees over the tile north of their base, so the top row
  // of a blocked area at least 2 tiles tall is walkable: the player can stand behind it, hidden by depth.
  const blockedAt = (tx: number, tz: number) => tz < 0 || base[tz * width + tx]!.category === "blocked";
  for (let tz = height - 2; tz >= 0; tz--) { // bottom-up, so a freed row never frees the one below
    for (let tx = 0; tx < width; tx++) {
      if (blockedAt(tx, tz) && !blockedAt(tx, tz - 1) && blockedAt(tx, tz + 1)) {
        base[tz * width + tx] = { category: "free", raw: base[tz * width + tx]!.raw };
      }
    }
  }

  const transitions = new Map<number, number>();
  for (let tz = 0; tz < height; tz++) {
    for (let tx = 0; tx < width; tx++) {
      const own = surfaces(tx, tz);
      if (own.length !== 1) continue;
      for (const [dx, dz] of NEIGHBORS) {
        const deck = surfaces(tx + dx, tz + dz);
        if (deck.length < 2) continue;
        const upper = deck.findIndex((h, i) => i > 0 && Math.abs(h - own[0]!) <= SAME_HEIGHT);
        if (upper > 0 && Math.abs(deck[upper - 1]! - own[0]!) > SAME_HEIGHT) transitions.set(tz * width + tx, upper);
      }
    }
  }

  const levels = Array.from({ length: levelCount }, (_, level): MapCollisionFile => ({
    kind: "map-collision",
    formatVersion: MAP_FORMAT_VERSION,
    map,
    level,
    width,
    height,
    tiles: base.map((cell, i) => {
      const target = transitions.get(i);
      if (target === undefined || (level !== 0 && level !== target)) return cell;
      return { category: "levelTransition", raw: cell.raw, targetLevel: level === 0 ? target : 0 };
    }),
  }));

  const warnings: CollisionWarning[] = [];
  if (ambiguous > 0) warnings.push({ code: "ambiguous-height", detail: `${ambiguous} tile(s) with more than 2 surfaces` });
  if (unknown.size > 0) {
    warnings.push({ code: "unknown-permission", detail: [...unknown].sort((a, b) => a - b).map((v) => `0x${v.toString(16)}`).join(", ") });
  }
  return { levels, warnings };
}
