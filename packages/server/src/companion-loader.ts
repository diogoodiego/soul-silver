import { largeSpeciesOf, parseCompanionFile, type BattleRules, type CompanionFileKind, type FollowRules, type ReactionRules } from "@soulsilver/shared/companion";
import battleRulesJson from "../../../content/companion/battle-rules.json" with { type: "json" };
import followJson from "../../../content/companion/follow.json" with { type: "json" };
import reactionsJson from "../../../content/companion/reactions.json" with { type: "json" };

// Companion data: the hand-written content/companion files (bundled with the app) checked against
// the extraction (spec 014, contracts/companion-data.md). Any problem stops the load with file, field and reason.

export type CompanionContent = Record<CompanionFileKind, unknown>;

/** The parts of the extraction the companion reads; each one is optional so a partial extraction still loads. */
export interface ExtractedForCompanion {
  /** The overworld-pokemon sprite set (feature 007), for the size of each species. */
  overworld?: Parameters<typeof largeSpeciesOf>[0] | undefined;
  /** Ids of the records in a text bank (feature 005), to check the reaction texts. */
  textIds?: ((bank: number) => readonly number[]) | undefined;
}

export interface CompanionData {
  follow: FollowRules;
  reactions: ReactionRules;
  battle: BattleRules;
  /** Species that go back to the ball indoors. */
  large: Set<number>;
}

function parse<K extends CompanionFileKind>(kind: K, value: unknown) {
  const result = parseCompanionFile(kind, value, `${kind}.json`);
  if (!result.ok) throw new Error(`content/companion/${result.error.file}: ${result.error.path}: ${result.error.problem}`);
  return result.data.value;
}

export function buildCompanionData(content: CompanionContent, extracted: ExtractedForCompanion = {}): CompanionData {
  const follow = parse("follow", content.follow) as FollowRules;
  const reactions = parse("reactions", content.reactions) as ReactionRules;
  const battle = parse("battle-rules", content["battle-rules"]) as BattleRules;
  if (extracted.textIds) {
    const texts = new Set(extracted.textIds(reactions.bank));
    reactions.rules.forEach((r, i) => {
      if (!texts.has(r.text)) throw new Error(`content/companion/reactions.json: value.rules.${i}.text: texto ${r.text} não existe no banco ${reactions.bank}`);
    });
    if (!texts.has(reactions.fallback.text)) throw new Error(`content/companion/reactions.json: value.fallback.text: texto ${reactions.fallback.text} não existe no banco ${reactions.bank}`);
  }
  const large = extracted.overworld ? largeSpeciesOf(extracted.overworld, follow) : new Set(follow.largeSpecies);
  return { follow, reactions, battle, large };
}

/** content/companion as bundled with the app. */
export const BUNDLED_COMPANION_CONTENT: CompanionContent = { follow: followJson, reactions: reactionsJson, "battle-rules": battleRulesJson };
