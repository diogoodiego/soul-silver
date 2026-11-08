import { z } from "zod";
import { int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

// The day tint of outdoor maps (spec 026, research R2): one colour per band, multiplied over the scene,
// blended across each band's edge. Hand-written; the values are a visual choice, tuned in layer 4.

const channel = () => z.number().min(0).max(1.5);
const rgb = z.strictObject({ r: channel(), g: channel(), b: channel() });

export const tintPalette = z.strictObject({
  morning: rgb,
  day: rgb,
  night: rgb,
  /** The blend at each band edge, centred on it; 0 switches at the edge. */
  transitionMinutes: int(0, 360),
});
export type TintPalette = z.infer<typeof tintPalette>;
export type Rgb = z.infer<typeof rgb>;

export const TIME_FORMAT_VERSION = 1;

export const timeSchemas = {
  tint: z.strictObject({ kind: z.literal("time-tint"), formatVersion: z.literal(TIME_FORMAT_VERSION), value: tintPalette }),
} as const;

const codec = createGameDataCodec(timeSchemas);
export const parseTimeFile = codec.parseGameDataFile;
