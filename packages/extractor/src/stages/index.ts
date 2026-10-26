import { SOULSILVER_US_LAYOUT } from "../data/layout.ts";
import { createDataStages } from "../data/stages.ts";
import { audioStage } from "../audio/stage.ts";
import { eventsStage } from "../events/stage.ts";
import { mapsStage } from "../maps/stage.ts";
import type { Stage } from "../pipeline/stage.ts";
import { spritesStage } from "../sprites/stage.ts";
import { textCatalogStage } from "../text/stage.ts";
import { titleStage } from "../title/stage.ts";
import { codeDecompressStage } from "./code-decompress.ts";
import { romUnpackStage } from "./rom-unpack.ts";

/** Every stage, used by both the app and the CLI. New stages are added here. */
export const defaultStages: readonly Stage[] = [
  romUnpackStage,
  codeDecompressStage,
  ...createDataStages(SOULSILVER_US_LAYOUT),
  textCatalogStage,
  mapsStage,
  spritesStage,
  eventsStage,
  audioStage,
  titleStage,
];
