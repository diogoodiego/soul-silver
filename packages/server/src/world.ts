import type { Entity } from "@soulsilver/shared/game";

/** Entity store. Entities are treated as immutable: change one by passing a new object to update(). */
export function createWorld() {
  const entities = new Map<number, Entity>();
  let nextId = 1;

  return {
    add(fields: Omit<Entity, "id">): Entity {
      const entity = { id: nextId++, ...fields };
      entities.set(entity.id, entity);
      return entity;
    },
    get: (id: number): Entity | undefined => entities.get(id),
    update(entity: Entity): void {
      if (!entities.has(entity.id)) throw new Error(`Unknown entity ${entity.id}`);
      entities.set(entity.id, entity);
    },
    remove(id: number): void {
      entities.delete(id);
    },
    /** In id order (ids are never reused). */
    all: (): Entity[] => [...entities.values()],
  };
}

export type World = ReturnType<typeof createWorld>;

/** Stable serialization of the whole world, for replay comparison. */
export function hashWorld(world: World): string {
  return JSON.stringify(world.all());
}
