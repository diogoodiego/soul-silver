import type { CollisionMap, WorldMap } from "@soulsilver/shared/game";
import type { CollisionCell } from "@soulsilver/shared/maps";
import { buildWildData, BUNDLED_WILD_CONTENT, type WildContent } from "../src/wild-loader";
import { MOVES, SPECIES } from "./combat-fixture";

// Synthetic wild data and maps for the spec 015 tests (principle II: numbers only, nothing from a ROM).

const slot = (species: number, chance: number) => ({ species, form: 0, minLevel: 3, maxLevel: 4, chance });

/** Encounter 1: Sentret and Rattata in the morning and by day, Hoothoot at night. */
export const ENCOUNTERS = [
  {
    id: 1,
    rates: { walking: 25, surfing: 0, rockSmash: 0, oldRod: 0, goodRod: 0, superRod: 0 },
    grass: {
      morning: [slot(SPECIES.sentret.id, 60), slot(SPECIES.rattata.id, 40)],
      day: [slot(SPECIES.sentret.id, 60), slot(SPECIES.rattata.id, 40)],
      night: [slot(SPECIES.hoothoot.id, 100)],
    },
  },
];

/** `content/wild` with some fields replaced. */
export function wildContent(patch: { spawn?: object; temperaments?: object } = {}): WildContent {
  const copy = JSON.parse(JSON.stringify(BUNDLED_WILD_CONTENT)) as Record<string, { value: Record<string, unknown> }>;
  Object.assign(copy["spawn"]!.value, patch.spawn);
  Object.assign(copy["temperaments"]!.value, patch.temperaments);
  return copy as unknown as WildContent;
}

export function wildData(patch: Parameters<typeof wildContent>[0] = {}, catchRate = 255) {
  return buildWildData(wildContent(patch), {
    encounters: ENCOUNTERS,
    learnsets: Object.values(SPECIES).map((s) => ({ id: s.id, levelUp: [{ level: 1, move: MOVES.tackle.id }] })),
    species: Object.values(SPECIES).map((s) => ({ id: s.id, catchRate, growthRate: "medium-fast" as const, baseFriendship: 70 })),
    evolutions: [],
  });
}

const cell = (category: CollisionCell["category"]): CollisionCell => ({ category, raw: 0 });

/** A 60×40 map, free except for tall grass where `grass` says. */
export function grassMap(id: string, grass: (x: number, y: number) => boolean, extra: Partial<WorldMap> = {}): WorldMap {
  const grid: CollisionMap = { width: 60, height: 40, tiles: Array.from({ length: 2400 }, (_, i) => cell(grass(i % 60, Math.floor(i / 60)) ? "tallGrass" : "free")) };
  return { id, levels: [grid], warps: [], neighbors: [], widthPx: 960, heightPx: 640, areaType: "outdoor", encounters: 1, ...extra };
}

/** Pixel centre of a tile. */
export const px = (tile: number) => tile * 16 + 8;
