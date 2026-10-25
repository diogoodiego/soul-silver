import type { TimeOfDay } from "../companion/schemas.ts";
import type { SpawnRules } from "./schemas.ts";

/** The encounter table in use at a host clock hour (0–23), with the HGSS bands by default (research R1). */
export function timeOfDay(hour: number, bands: SpawnRules["timeBands"]): TimeOfDay {
  if (hour >= bands.night || hour < bands.morning) return "night";
  return hour >= bands.day ? "day" : "morning";
}
