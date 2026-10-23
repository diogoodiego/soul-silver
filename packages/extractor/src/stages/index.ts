import type { Stage } from "../pipeline/stage.ts";
import { romUnpackStage } from "./rom-unpack.ts";

/** Every stage, used by both the app and the CLI. New stages (specs 4–9) are added here. */
export const defaultStages: readonly Stage[] = [romUnpackStage];
