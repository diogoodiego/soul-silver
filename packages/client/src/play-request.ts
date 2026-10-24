import type { Save } from "@soulsilver/shared/save";

/** A session the player is entering: the menu hands it to the game screen. */
export interface PlayRequest {
  save: Save;
  slot: number;
  /** Set when joining a host; used to reconnect. */
  address?: string;
}
