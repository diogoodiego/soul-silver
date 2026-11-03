// The extracted data the game server runs on, shared by the server utility process and the golden path (spec 024).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_AI_CONTENT, BUNDLED_COMBAT_CONTENT, BUNDLED_COMPANION_CONTENT, BUNDLED_WILD_CONTENT, buildAiData, buildCombatData, buildCompanionData, buildItemsData, buildProgressionData, buildShopData, buildTrainerData, buildWildData, loadWorld, type CombatData, type CompanionData, type ItemsData, type ProgressionData, type ShopData, type TrainerData, type WildData } from "@soulsilver/server";
import { parseEventsJson } from "@soulsilver/shared/events";
import { parseSpriteJson } from "@soulsilver/shared/sprites";
import { parseTextJson } from "@soulsilver/shared/text";
import { readExtracted } from "./extracted";
import { loadScripts } from "./scripts-loader";

type Log = (message: string) => void;

/** Combat data (spec 013) checked against the extraction; without it the server runs without combat. */
function combatOrNothing(dir: string, log: Log): CombatData | undefined {
  try {
    return buildCombatData(BUNDLED_COMBAT_CONTENT, { moves: readExtracted(dir, "moves"), species: readExtracted(dir, "species"), typeChart: readExtracted(dir, "type-chart") });
  } catch (error) {
    log(`Combate desativado: ${(error as Error).message}`);
    return undefined;
  }
}

function readJson<T>(parse: (text: string, path: string) => { ok: true; data: T } | { ok: false; error: { file: string; path: string; problem: string } }, path: string): T {
  const parsed = parse(readFileSync(path, "utf8"), path);
  if (!parsed.ok) throw new Error(`${parsed.error.file}: ${parsed.error.path}: ${parsed.error.problem}`);
  return parsed.data;
}

/** Companion rules (spec 014): the bundled data, with Pokémon sizes and reaction texts from the extraction when there is one. */
function companionOrNothing(dir: string | undefined, log: Log): CompanionData | undefined {
  try {
    if (!dir) return buildCompanionData(BUNDLED_COMPANION_CONTENT);
    return buildCompanionData(BUNDLED_COMPANION_CONTENT, {
      overworld: readJson((t, p) => parseSpriteJson("sprite-set", t, p), join(dir, "sprites", "sprites", "overworld-pokemon.json")),
      textIds: (bank) => readJson((t, p) => parseTextJson("text-bank", t, p), join(dir, "text-catalog", "catalog", "en", `${String(bank).padStart(4, "0")}.json`)).records.map((r) => r.id),
    });
  } catch (error) {
    log(`Companheiro desativado: ${(error as Error).message}`);
    return undefined;
  }
}


/** Wild Pokémon (spec 015): the bundled data plus encounter tables, learnsets, catch rates and evolutions from the extraction. */
function wildOrNothing(dir: string, log: Log): WildData | undefined {
  try {
    return buildWildData(BUNDLED_WILD_CONTENT, {
      encounters: readJson((t, p) => parseEventsJson("encounters", t, p), join(dir, "events", "events", "encounters.json")).records,
      learnsets: readExtracted(dir, "learnsets"),
      species: readExtracted(dir, "species"),
      evolutions: readExtracted(dir, "evolutions"),
    });
  } catch (error) {
    log(`Selvagens desativados: ${(error as Error).message}`);
    return undefined;
  }
}
/** Progression (spec 016): base experience, EV yields, curves, learnsets and evolutions from the extraction. */
function progressionOrNothing(dir: string, log: Log): ProgressionData | undefined {
  try {
    return buildProgressionData({ species: readExtracted(dir, "species"), learnsets: readExtracted(dir, "learnsets"), evolutions: readExtracted(dir, "evolutions") });
  } catch (error) {
    log(`Progressão desativada: ${(error as Error).message}`);
    return undefined;
  }
}

/** Items used from the bag (spec 017); without them every item is unavailable. */
function itemsOrNothing(dir: string, log: Log): ItemsData | undefined {
  try {
    return buildItemsData(readExtracted(dir, "items"));
  } catch (error) {
    log(`Itens desativados: ${(error as Error).message}`);
    return undefined;
  }
}

/** Poké Marts (spec 023): the extracted stock and the item prices. */
function shopsOrNothing(dir: string, log: Log): ShopData | undefined {
  try {
    return buildShopData(readJson((t, p) => parseEventsJson("shops", t, p), join(dir, "events", "events", "shops.json")).records, readExtracted(dir, "items"));
  } catch (error) {
    log(`Lojas desativadas: ${(error as Error).message}`);
    return undefined;
  }
}

/** Trainer battles (spec 022): the extracted trainers and the bundled content/trainer. */
function trainersOrNothing(dir: string, log: Log): TrainerData | undefined {
  try {
    const events = join(dir, "events", "events");
    return buildTrainerData(
      {
        trainers: readJson((t, p) => parseEventsJson("trainers", t, p), join(events, "trainers.json")).records,
        classes: readJson((t, p) => parseEventsJson("trainer-classes", t, p), join(events, "trainer-classes.json")).records,
        messages: readJson((t, p) => parseEventsJson("trainer-messages", t, p), join(events, "trainer-messages.json")).records,
        learnsets: readExtracted(dir, "learnsets"),
      },
      buildAiData(BUNDLED_AI_CONTENT).profiles.map((p) => p.id),
    );
  } catch (error) {
    log(`Treinadores desativados: ${(error as Error).message}`);
    return undefined;
  }
}

/** Everything the server reads from the extraction; each part is left out, with a log line, when its data is missing or invalid. */
export function loadServerData(dir: string | undefined, log: Log) {
  return {
    world: dir ? loadWorld(dir, log) : undefined,
    combat: dir ? combatOrNothing(dir, log) : undefined,
    companion: companionOrNothing(dir, log),
    wild: dir ? wildOrNothing(dir, log) : undefined,
    progression: dir ? progressionOrNothing(dir, log) : undefined,
    items: dir ? itemsOrNothing(dir, log) : undefined,
    scripts: dir ? loadScripts(dir, log) : undefined,
    trainers: dir ? trainersOrNothing(dir, log) : undefined,
    shops: dir ? shopsOrNothing(dir, log) : undefined,
  };
}
