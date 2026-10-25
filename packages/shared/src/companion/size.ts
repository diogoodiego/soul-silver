import type { FollowRules } from "./schemas.ts";

interface SpriteSetPart {
  frames: readonly { name: string; w: number; h: number }[];
  sprites: readonly { species?: number | undefined; frames: readonly string[]; animations: readonly { steps: readonly { frame: string }[] }[] }[];
}

/** Species too large to follow indoors: overworld frame past the limit (feature 007), plus the listed ones. */
export function largeSpeciesOf(set: SpriteSetPart, rules: Pick<FollowRules, "largeFramePx" | "largeSpecies">): Set<number> {
  const frames = new Map(set.frames.map((f) => [f.name, f]));
  const large = new Set(rules.largeSpecies);
  for (const s of set.sprites) {
    const f = frames.get(s.animations[0]?.steps[0]?.frame ?? s.frames[0] ?? "");
    if (s.species !== undefined && f && (f.w > rules.largeFramePx || f.h > rules.largeFramePx)) large.add(s.species);
  }
  return large;
}
