import type { ArenaSpec } from "@soulsilver/shared/game";
import type { Combat } from "./combat";
import type { World } from "./world";

// The dev arena (spec 013, US6): two combatants on open ground, A for the player and B as an idle wild target.

/** Not a real map: unknown areas are open ground on both sides. */
export const ARENA_AREA = "arena";
const A_AT = { x: 96, y: 96 };
const B_AT = { x: 176, y: 96 };

/** Spawns both combatants; on a bad spec nothing is left in the world and the error is thrown. */
export function spawnArena(world: World, combat: Combat, spec: ArenaSpec, playerId: number): { a: number; b: number } {
  const a = world.add({ kind: "pokemon", area: ARENA_AREA, ...A_AT, level: 0, facing: "east", data: {} });
  const b = world.add({ kind: "pokemon", area: ARENA_AREA, ...B_AT, level: 0, facing: "west", data: {} });
  try {
    combat.spawn(world, a.id, spec.a, playerId);
    combat.spawn(world, b.id, spec.b, "wild");
  } catch (error) {
    for (const id of [a.id, b.id]) {
      combat.remove(world, id);
      world.remove(id);
    }
    throw error;
  }
  return { a: a.id, b: b.id };
}
