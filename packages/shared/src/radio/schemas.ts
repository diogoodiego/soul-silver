import { z } from "zod";
import { int } from "../game-data/common.ts";
import { createGameDataCodec } from "../game-data/parse.ts";

// The radio (spec 026, research R7.5), hand-written: the shows and their message banks
// (src/application/pokegear/radio/shows/*.c) and how the music changes the encounter rate
// (src/field/encounter_check.c). No text here: the lines come from the text catalog.

export const RADIO_MUSIC = ["march", "lullaby"] as const;
export type RadioMusic = (typeof RADIO_MUSIC)[number];

const show = z.strictObject({
  id: z.string().regex(/^[a-z][A-Za-z]*$/),
  bank: int(0, 0xffff),
});

export const radioChannels = z
  .strictObject({
    shows: z.array(show).min(1),
    /** The original's modified encounter rate before the music (40). */
    baseRate: int(1, 100),
    /** Points the music adds to the rate. */
    music: z.strictObject({ march: int(-100, 100), lullaby: int(-100, 100) }),
    /**
     * Johto's stations, in dial order (RadioShow_TranslateStationID): each plays shows[hour % shows.length].
     * The Kanto, Ruins of Alph, Rocket and Mahogany dials come after Violet City and are not listed yet.
     */
    stations: z.array(z.strictObject({ id: z.string().regex(/^[a-z][A-Za-z]*$/), shows: z.array(z.string()).min(1) })).min(1),
  })
  .superRefine((v, ctx) => {
    v.stations.forEach((st, i) => {
      for (const show of st.shows) if (!v.shows.some((s) => s.id === show)) ctx.addIssue({ code: "custom", path: ["stations", i, "shows"], message: `programa ${show} não existe` });
    });
    for (const key of RADIO_MUSIC) if (v.baseRate + v.music[key] <= 0) ctx.addIssue({ code: "custom", path: ["music"], message: `${key} leva a taxa a zero ou menos` });
  });
export type RadioChannels = z.infer<typeof radioChannels>;

export const RADIO_FORMAT_VERSION = 1;

export const radioSchemas = {
  channels: z.strictObject({ kind: z.literal("radio-channels"), formatVersion: z.literal(RADIO_FORMAT_VERSION), value: radioChannels }),
} as const;

const codec = createGameDataCodec(radioSchemas);
export const parseRadioFile = codec.parseGameDataFile;
