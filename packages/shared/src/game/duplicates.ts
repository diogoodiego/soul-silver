import { SCRIPT_BANKS } from "../events/refs.ts";

/** Script ids from here up live in the common banks, shared by every map. */
const COMMON_SCRIPTS = Math.min(...SCRIPT_BANKS.map((b) => b.lo));

/** The fields of a map object that tell who it is. */
export interface ObjectIdentity {
  id: number;
  sprite: number;
  hideFlag: number;
  script: { id: number } | null;
}

/**
 * Groups of objects showing one character twice (research R8): the same sprite and script, or a known
 * pair of versions, given by their hide flags. `visible` is the caller's filter, the one the game uses.
 * The same sprite alone is legitimate: trainers and scenery share sprites. So is a script from the common
 * banks (apricorn trees, item balls): only a map's own scripts belong to one character.
 */
export function findDuplicates<T extends ObjectIdentity>(objects: readonly T[], visible: (object: T) => boolean, versions: readonly (readonly [number, number])[] = []): T[][] {
  const groups = new Map<string, T[]>();
  const add = (key: string, object: T) => groups.set(key, [...(groups.get(key) ?? []), object]);
  for (const object of objects.filter(visible)) {
    if (object.script && object.script.id < COMMON_SCRIPTS) add(`${object.sprite}:${object.script.id}`, object);
    versions.forEach((pair, i) => {
      if (pair.includes(object.hideFlag)) add(`version ${i}`, object);
    });
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
