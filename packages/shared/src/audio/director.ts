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
}

/** Track id to play; null for silence. */
export function desiredMusic(state: MusicState, music: { title: number; wildBattle: number; victory: number }): number | null {
  if (state.screen === "title") return music.title;
  if (state.victory) return music.victory;
  if (state.inCombat) return music.wildBattle;
  return (state.night ? state.musicNight : state.musicDay) || null;
}
