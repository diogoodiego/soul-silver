import type { WorldLookup } from "../game/world-map.ts";
import type { Save } from "./schema.ts";

/** Returns a message when the save breaks a rule, nothing when it holds. */
export type CoherenceRule<S = Save> = (save: S, world: WorldLookup) => string | undefined;

/** Rules that depend on the world; the schema already covers ranges. Later features add theirs (party levels...). */
export const COHERENCE_RULES: CoherenceRule[] = [
  (save, world) => {
    const map = world(save.area);
    if (!map) return `area: o mapa "${save.area}" não existe`;
    if (save.x < 0 || save.x > map.widthPx) return `x: ${save.x} fora do mapa (0..${map.widthPx})`;
    if (save.y < 0 || save.y > map.heightPx) return `y: ${save.y} fora do mapa (0..${map.heightPx})`;
    return undefined;
  },
];

export function checkCoherence<S extends Save = Save>(
  save: S,
  world: WorldLookup,
  rules: CoherenceRule<S>[] = COHERENCE_RULES,
): { ok: true } | { ok: false; message: string } {
  for (const rule of rules) {
    const problem = rule(save, world);
    if (problem) return { ok: false, message: `Save incoerente: ${problem}` };
  }
  return { ok: true };
}
