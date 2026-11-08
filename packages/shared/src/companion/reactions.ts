import type { Emotion, Place, ReactionRules, TimeOfDay } from "./schemas.ts";

/** Caves and interiors from the map header; outdoor maps are towns when their mapsec is listed, else routes. */
export function placeOf(areaType: "outdoor" | "indoor" | "cave" | undefined, mapsec: number | undefined, towns: readonly number[]): Place {
  if (areaType === "cave" || areaType === "indoor") return areaType;
  return mapsec !== undefined && towns.includes(mapsec) ? "town" : "route";
}

export interface ReactionContext {
  place: Place;
  time: TimeOfDay;
  friendship: number;
}

/** The matching rule with most conditions; `roll(n)` picks among ties (0 ≤ result < n). */
export function pickReaction(rules: ReactionRules, ctx: ReactionContext, roll: (n: number) => number): { emotion: Emotion; text: number } {
  const matching = rules.rules.filter(({ when }) =>
    (when.place === undefined || when.place === ctx.place) &&
    (when.time === undefined || when.time === ctx.time) &&
    (when.friendshipMin === undefined || ctx.friendship >= when.friendshipMin) &&
    (when.friendshipMax === undefined || ctx.friendship <= when.friendshipMax),
  );
  const score = (r: (typeof matching)[number]) => Object.keys(r.when).length;
  const best = Math.max(...matching.map(score));
  const top = matching.filter((r) => score(r) === best);
  const pick = top[roll(top.length)];
  return pick ? { emotion: pick.emotion, text: pick.text } : rules.fallback;
}
