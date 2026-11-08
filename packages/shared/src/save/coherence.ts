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
  (save, world) => (save.respawn && !world(save.respawn.area) ? `respawn.area: o mapa "${save.respawn.area}" não existe` : undefined),
  (save) => {
    const missing = save.pokedex.caught.find((s) => !save.pokedex.seen.includes(s));
    return missing === undefined ? undefined : `pokedex.caught: espécie ${missing} capturada sem ter sido vista`;
  },
  (save) => {
    const item = save.pending.find((i) => i.member >= save.party.length);
    return item ? `pending: membro ${item.member} não existe na equipe` : undefined;
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

/** Spec 025 (contracts/save-v9.md): every visited fly point is one of the extracted ones. */
export const flyPointsRule =
  (points: readonly { map: number }[]): CoherenceRule =>
  (save) => {
    const unknown = save.flyPoints.find((area) => !points.some((p) => String(p.map) === area));
    return unknown === undefined ? undefined : `flyPoints: "${unknown}" não é um ponto de voo`;
  };
