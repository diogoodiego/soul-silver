// The Pokégear radio on the server (spec 026, US3): each player's station, kept in memory only, and its
// effect on the spawn cap of the area they stand in (shared/radio/channels.ts, research R7.5).
import type { ServerMessage } from "@soulsilver/shared/game";
import { listenerFactor, parseRadioFile, stationShow, type MusicState, type RadioChannels } from "@soulsilver/shared/radio";
import channelsJson from "../../../content/radio/channels.json" with { type: "json" };

const file = parseRadioFile("channels", channelsJson, "content/radio/channels.json");
if (!file.ok) throw new Error(`${file.error.file}: ${file.error.path}: ${file.error.problem}`);
const RADIO: RadioChannels = file.data.value;
/** ITEM_GB_SOUNDS (items.h): with it, Sunday's Pokémon Music plays the GB tunes, which change nothing. */
export const GB_SOUNDS = 502;

export function createRadio(options: { hour(): number; weekday(): number }) {
  /** Each player's station and the area they tuned it in: leaving the area turns it off (the field music takes over). */
  const tuned = new Map<number, { station: string; area: string }>();
  const current = (playerId: number, area: string) => {
    const t = tuned.get(playerId);
    if (t && t.area !== area) tuned.delete(playerId);
    return tuned.get(playerId)?.station ?? null;
  };
  const bankOf = (show: string | undefined) => RADIO.shows.find((s) => s.id === show)?.bank ?? 0;
  return {
    /** The stations and what each plays now, and this player's. */
    state(playerId: number, area: string): Extract<ServerMessage, { type: "radio-state" }> {
      return { type: "radio-state", shows: RADIO.stations.map((st) => ({ id: st.id, bank: bankOf(stationShow(RADIO, st.id, options.hour())) })), tuned: current(playerId, area) };
    },
    /** False for a station that does not exist; null turns the radio off. */
    tune(playerId: number, station: string | null, area: string): boolean {
      if (station === null) tuned.delete(playerId);
      else if (RADIO.stations.some((s) => s.id === station)) tuned.set(playerId, { station, area });
      else return false;
      return true;
    },
    /** This player's factor on the cap of their area. */
    factor(playerId: number, area: string, music: MusicState): number {
      const station = current(playerId, area);
      return listenerFactor(RADIO, station && stationShow(RADIO, station, options.hour()), options.weekday(), music);
    },
    /** Every tick: a player out of the area they tuned in loses the station. */
    at(playerId: number, area: string): void {
      current(playerId, area);
    },
    leave(playerId: number): void {
      tuned.delete(playerId);
    },
  };
}
