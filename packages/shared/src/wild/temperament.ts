import { MAP_TILE_PX } from "../maps/constants.ts";
import type { Temperament, Temperaments } from "./schemas.ts";

// The wild AI (spec 015, research R7): a state per Pokémon, changed once per tick by stepAi.

export type AiState = "wander" | "flee" | "chase" | "return";

interface Point {
  x: number;
  y: number;
}

export interface AiContext {
  temperament: Temperament;
  radii: Temperaments["radii"];
  leashTiles: number;
  /** Past this distance a chase is given up (spec 14, battle-rules chaseLimitTiles). */
  chaseLimitTiles: number;
  self: Point;
  origin: Point;
  /** The closest trainer or player's Pokémon in the area. */
  nearest: Point | undefined;
  /** Took damage this tick. */
  hurt: boolean;
  /** Escaped a ball: chases whatever its temperament. */
  angry: boolean;
}

const tiles = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) / MAP_TILE_PX;

export function stepAi(state: AiState, ctx: AiContext): AiState {
  const { radii, nearest } = ctx;
  if (state === "return") return tiles(ctx.self, ctx.origin) < 1 ? "wander" : "return";
  if (tiles(ctx.self, ctx.origin) > ctx.leashTiles) return "return";
  const dist = nearest ? tiles(ctx.self, nearest) : Infinity;
  const chases = ctx.angry || ctx.temperament === "aggressive";
  if (chases) {
    if (state === "chase") return dist <= ctx.chaseLimitTiles ? "chase" : "wander";
    return dist <= radii.detectTiles ? "chase" : "wander";
  }
  if (ctx.temperament === "territorial") return nearest && tiles(nearest, ctx.origin) <= radii.territoryTiles ? "chase" : "wander";
  if (state === "flee") return dist <= radii.sightTiles ? "flee" : "wander";
  if (ctx.hurt || (ctx.temperament === "skittish" && dist <= radii.sightTiles)) return "flee";
  return "wander";
}
