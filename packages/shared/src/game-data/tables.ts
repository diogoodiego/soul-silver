import { z } from "zod";
import { BATTLE_STAT_KEYS, fileSchema, id, int, textRef } from "./common.ts";
import { GROWTH_RATE_KEYS } from "./species.ts";

// types.json, type-chart.json, natures.json, abilities.json; see data-model.md and research R8.

export const TYPE_KEYS = [
  "normal", "fighting", "flying", "poison", "ground", "rock", "bug", "ghost", "steel",
  "unknown", "fire", "water", "grass", "electric", "psychic", "ice", "dragon", "dark",
] as const;
export type TypeKey = (typeof TYPE_KEYS)[number];

export const typeRecord = z.strictObject({
  id: int(0, 17),
  key: z.enum(TYPE_KEYS),
  name: textRef("type-names"),
});
export const typesFile = fileSchema("types", typeRecord);
export type TypeRecord = z.infer<typeof typeRecord>;

/** Damage multiplier in tenths: 0, 5 (½×), 10 (1×) or 20 (2×). */
const tenths = z.literal([0, 5, 10, 20]);

export const typeChartRecord = z.strictObject({
  /** Id of the attacking type. */
  id: int(0, 17),
  /** Multiplier against each defending type, indexed by its id. */
  against: z.array(tenths).length(18),
});
export const typeChartFile = fileSchema("type-chart", typeChartRecord, {
  /** Pairs that Foresight and Odor Sleuth ignore, in the original order. */
  foresightIgnored: z.array(z.strictObject({ attacker: int(0, 17), defender: int(0, 17) })),
});
export type TypeChartRecord = z.infer<typeof typeChartRecord>;

const natureStat = z.enum(BATTLE_STAT_KEYS).nullable();

export const natureRecord = z
  .strictObject({
    id: int(0, 24),
    name: textRef("nature-names"),
    /** Null on neutral natures. */
    increased: natureStat,
    decreased: natureStat,
  })
  .superRefine((nature, ctx) => {
    if ((nature.increased === null) !== (nature.decreased === null)) {
      ctx.addIssue({ code: "custom", path: ["decreased"], message: "esperado os dois stats preenchidos ou os dois nulos" });
    } else if (nature.increased !== null && nature.increased === nature.decreased) {
      ctx.addIssue({ code: "custom", path: ["decreased"], message: "esperado um stat diferente do que sobe" });
    }
  });
export const naturesFile = fileSchema("natures", natureRecord);
export type NatureRecord = z.infer<typeof natureRecord>;

export const abilityRecord = z.strictObject({ id: id(), name: textRef("ability-names") });
export const abilitiesFile = fileSchema("abilities", abilityRecord);
export type AbilityRecord = z.infer<typeof abilityRecord>;

export const growthRateRecord = z.strictObject({
  id: int(0, 5),
  key: z.enum(GROWTH_RATE_KEYS),
  /** Total experience for levels 1 to 100. The sanity report checks that it never decreases. */
  experience: z.array(int(0, 0xffffffff)).length(100),
});
export const growthRatesFile = fileSchema("growth-rates", growthRateRecord);
export type GrowthRateRecord = z.infer<typeof growthRateRecord>;
