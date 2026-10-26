import { parseAiFile, type AiFileKind, type AiTuning, type SkillProfile, type TemperamentTable, type WildLevels } from "@soulsilver/shared/ai";
import profilesJson from "../../../content/ai/profiles.json" with { type: "json" };
import temperamentsJson from "../../../content/ai/temperaments.json" with { type: "json" };
import tuningJson from "../../../content/ai/tuning.json" with { type: "json" };
import wildLevelsJson from "../../../content/ai/wild-levels.json" with { type: "json" };

// Combat AI data (spec 019, contracts/ai-data.md). Any problem stops the load with file, field and reason.

export type AiContent = Record<AiFileKind, unknown>;

export interface AiData {
  profiles: SkillProfile[];
  temperaments: TemperamentTable;
  wildLevels: WildLevels;
  tuning: AiTuning;
}

const FILES: Record<AiFileKind, string> = { profiles: "profiles.json", temperaments: "temperaments.json", wildLevels: "wild-levels.json", tuning: "tuning.json" };

function parse(kind: AiFileKind, value: unknown): unknown {
  const result = parseAiFile(kind, value, FILES[kind]);
  if (!result.ok) throw new Error(`content/ai/${result.error.file}: ${result.error.path}: ${result.error.problem}`);
  return result.data.value;
}

export function buildAiData(content: AiContent): AiData {
  const { profiles } = parse("profiles", content.profiles) as { profiles: SkillProfile[] };
  const wildLevels = parse("wildLevels", content.wildLevels) as WildLevels;
  wildLevels.bands.forEach((b, i) => {
    if (!profiles.some((p) => p.id === b.profile)) throw new Error(`content/ai/wild-levels.json: value.bands.${i}.profile: perfil ${b.profile} não existe em profiles.json`);
  });
  return { profiles, wildLevels, temperaments: parse("temperaments", content.temperaments) as TemperamentTable, tuning: parse("tuning", content.tuning) as AiTuning };
}

/** content/ai as bundled with the app. */
export const BUNDLED_AI_CONTENT: AiContent = { profiles: profilesJson, temperaments: temperamentsJson, wildLevels: wildLevelsJson, tuning: tuningJson };
