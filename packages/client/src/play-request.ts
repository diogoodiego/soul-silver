import type { ArenaSpec } from "@soulsilver/shared/game";
import type { Save } from "@soulsilver/shared/save";

/** A session the player is entering: the menu hands it to the game screen. */
export interface PlayRequest {
  save: Save;
  /** Absent in the dev arena, which is tied to no slot. */
  slot?: number;
  /** Started as the LAN host from the menu. */
  hosting?: boolean;
  /** Set when joining a host; used to reconnect. */
  address?: string;
  /** O.6: the online room the guest came in by (address is then PEER_ADDRESS); reconnects through it. */
  room?: { code: string; playerName: string };
  /** The dev arena (spec 013): local, on a throwaway arenaSave, so nothing is saved. */
  arena?: ArenaSpec;
}
