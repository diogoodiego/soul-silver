import type { ItemRecord } from "../game-data/items.ts";
import { heldOf } from "./held.ts";
import { useEffectOf } from "./effects.ts";
import type { ItemEffects } from "./schemas.ts";

// The item coverage report (spec 027, FR-017, research R10): items whose use and hold effects map to
// nothing, as the moves report does for archetypes. `npm run items:coverage` runs it on the extraction.

export interface ItemCoverage {
  /** Item ids with no use effect and no hold effect, increasing. */
  unmapped: number[];
  /** The ones among them the player can get in the stretch checked (to Violet City). */
  obtainableUnmapped: number[];
}

/** An item counts as mapped when it has a use effect or a hold effect, a passive "none" with its reason included. */
export function itemCoverage(records: readonly Pick<ItemRecord, "id" | "pocket" | "partyUse" | "holdEffect">[], effects: ItemEffects, obtainable: ReadonlySet<number>): ItemCoverage {
  const unmapped = records
    .filter((r) => r.id > 0 && !useEffectOf(r, effects) && !heldOf(r, effects))
    .map((r) => r.id)
    .sort((a, b) => a - b);
  return { unmapped, obtainableUnmapped: unmapped.filter((id) => obtainable.has(id)) };
}
