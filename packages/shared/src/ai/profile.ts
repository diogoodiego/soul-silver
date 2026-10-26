import type { SkillProfile, WildLevels } from "./schemas.ts";

/** The wild profile for a level, from content/ai/wild-levels.json (spec 019, US3). */
export function profileFor(level: number, table: WildLevels, profiles: readonly SkillProfile[]): SkillProfile {
  const band = table.bands.find((b) => level >= b.minLevel && level <= b.maxLevel);
  if (!band) throw new Error(`Nível ${level} fora de wild-levels.json`);
  const p = profiles.find((x) => x.id === band.profile);
  if (!p) throw new Error(`Perfil ${band.profile} não existe em profiles.json`);
  return p;
}
