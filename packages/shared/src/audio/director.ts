import type { TrainerMusic } from "../events/schemas.ts";

// Which music the local player should hear now (spec 018, research R3). Each client decides from its
// own state, so a player out of combat keeps the place's music.

export interface MusicState {
  screen: "title" | "game";
  /** Track ids from the map header (spec 006). */
  musicDay: number;
  musicNight: number;
  /** Read when entering the map, so the music does not switch mid-track. */
  night: boolean;
  inCombat: boolean;
  /** From the end of a won combat until the fanfare ends. */
  victory: boolean;
  /** The class music of the trainer this player fights or just beat (spec 022); undefined against wild Pokémon. */
  trainer?: TrainerMusic | undefined;
}

export interface MusicTracks {
  title: number;
  wildBattle: number;
  victory: number;
  trainerBattle: number;
  rivalBattle: number;
  leaderBattle: number;
  rocketBattle: number;
  championBattle: number;
  trainerVictory: number;
  leaderVictory: number;
}

/** Track id to play; null for silence. */
export function desiredMusic(state: MusicState, music: MusicTracks): number | null {
  if (state.screen === "title") return music.title;
  if (state.victory) return state.trainer === undefined ? music.victory : state.trainer === "leader" ? music.leaderVictory : music.trainerVictory;
  if (state.inCombat) return state.trainer === undefined ? music.wildBattle : music[`${state.trainer}Battle`];
  return (state.night ? state.musicNight : state.musicDay) || null;
}
