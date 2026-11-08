import type { RadioChannels, RadioMusic } from "./schemas.ts";

// The radio's effect on the field (spec 026, research R7.5). There are no random encounters here, so the
// music's change of the encounter rate (encounter_check.c) scales the map's spawn cap instead (balance-log).

/** What changes Pokémon Music's pick: GB Sounds in the bag, the National Pokédex. */
export interface MusicState {
  gbSounds: boolean;
  nationalDex: boolean;
}

/** The track Pokémon Music plays (pokemon_music.c); null for one with no effect (GB Sounds, Hoenn, Sinnoh). */
export function musicOf(weekday: number, s: MusicState): RadioMusic | null {
  switch (weekday) {
    case 0:
      return s.gbSounds ? null : "march";
    case 1:
    case 5:
      return "march";
    case 3:
      return s.nationalDex ? null : "march";
    case 2:
    case 6:
      return "lullaby";
    case 4:
      return s.nationalDex ? null : "lullaby";
    default:
      return null;
  }
}

/** The show a station plays at this hour, or undefined for no such station. */
export function stationShow(radio: RadioChannels, station: string, hour: number): string | undefined {
  const shows = radio.stations.find((s) => s.id === station)?.shows;
  return shows?.[hour % shows.length];
}

/** One player's factor on the cap: (base + Δ) / base while Pokémon Music plays a track with an effect, else 1. */
export function listenerFactor(radio: RadioChannels, show: string | null | undefined, weekday: number, s: MusicState): number {
  const music = show === "pokemonMusic" ? musicOf(weekday, s) : null;
  return music ? (radio.baseRate + radio.music[music]) / radio.baseRate : 1;
}

/** The cap with the players in the area: the mean of their factors (1 for each who does not listen), rounded. */
export function capFor(base: number, factors: readonly number[]): number {
  if (!factors.length) return base;
  return Math.round((base * factors.reduce((a, b) => a + b, 0)) / factors.length);
}

/** What Pokémon Music says now, as message indices of its bank (pokemon_music.c: message 2, then the day's). */
export function pokemonMusicLines(weekday: number, s: MusicState): number[] {
  const day = weekday === 0 && !s.gbSounds ? 12 : weekday === 3 && s.nationalDex ? 10 : weekday === 4 && s.nationalDex ? 11 : 3 + weekday;
  return [2, day];
}
