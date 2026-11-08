import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capFor, listenerFactor, musicOf, pokemonMusicLines, stationShow } from "../../src/radio/channels.ts";
import { parseRadioFile, type RadioChannels } from "../../src/radio/schemas.ts";

// Spec 026, T043 (research R7.5): Pokémon Music plays March or Lullaby by the weekday (pokemon_music.c), the
// music moves the encounter rate from its base 40 (encounter_check.c), and the spawn cap follows the factor
// (40 + Δ) / 40, averaged over the players in the area. The Johto stations by hour (RadioShow_TranslateStationID).

const parsed = parseRadioFile("channels", JSON.parse(readFileSync(new URL("../../../../content/radio/channels.json", import.meta.url), "utf8")), "channels.json");
if (!parsed.ok) throw new Error(parsed.error.problem);
const radio: RadioChannels = parsed.data.value;

describe("Pokémon Music by the weekday", () => {
  it.each([
    [0, false, false, "march"],
    [0, true, false, null],
    [1, false, false, "march"],
    [2, false, false, "lullaby"],
    [3, false, false, "march"],
    [3, false, true, null],
    [4, false, false, "lullaby"],
    [4, false, true, null],
    [5, false, false, "march"],
    [6, false, false, "lullaby"],
  ] as const)("weekday %i (GB Sounds %s, National Dex %s) plays %s", (weekday, gbSounds, nationalDex, music) => {
    expect(musicOf(weekday, { gbSounds, nationalDex })).toBe(music);
  });
});

describe("the spawn cap", () => {
  const music = (weekday: number) => listenerFactor(radio, "pokemonMusic", weekday, { gbSounds: false, nationalDex: false });

  it("March is 1.625 and Lullaby 0.375; any other show is 1", () => {
    expect(music(1)).toBe(1.625);
    expect(music(2)).toBe(0.375);
    expect(listenerFactor(radio, "pokemonTalk", 1, { gbSounds: false, nationalDex: false })).toBe(1);
    expect(listenerFactor(radio, null, 1, { gbSounds: false, nationalDex: false })).toBe(1);
  });

  it("averages the players in the area, a player not listening counting 1, and rounds", () => {
    expect(capFor(8, [music(1)])).toBe(13);
    expect(capFor(8, [music(2)])).toBe(3);
    expect(capFor(8, [music(1), 1])).toBe(Math.round(8 * 1.3125));
    expect(capFor(8, [])).toBe(8);
  });
});

describe("the Johto stations", () => {
  it("turn the show by the hour", () => {
    expect(stationShow(radio, "music", 10)).toBe("pokemonMusic");
    expect([10, 11].map((h) => stationShow(radio, "profiles", h))).toEqual(["trainerProfiles", "thatTownThesePeople"]);
    expect([9, 10, 11].map((h) => stationShow(radio, "variety", h))).toEqual(["pokemonSearchParty", "serialRadioDrama", "buenasPassword"]);
    expect(stationShow(radio, "nowhere", 10)).toBeUndefined();
  });
});

// pokemon_music.c: message 2, then 3 + the weekday; on Sunday without GB Sounds 12, on Wednesday and Thursday
// with the National Pokédex 10 and 11.
describe("Pokémon Music's lines", () => {
  it.each([
    [0, false, false, [2, 12]],
    [0, true, false, [2, 3]],
    [1, false, false, [2, 4]],
    [3, false, true, [2, 10]],
    [4, false, true, [2, 11]],
    [6, false, false, [2, 9]],
  ] as const)("weekday %i (GB Sounds %s, National Dex %s) says %j", (weekday, gbSounds, nationalDex, lines) => {
    expect(pokemonMusicLines(weekday, { gbSounds, nationalDex })).toEqual(lines);
  });
});
