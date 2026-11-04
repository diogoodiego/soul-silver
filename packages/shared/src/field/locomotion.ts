import type { LocomotionClass, PlayerMode } from "./schemas.ts";

/** Whether a species of this class may be launched in combat while the player is in this mode. */
export function launchAllowed(locomotion: LocomotionClass, mode: PlayerMode): boolean {
  return mode !== "surf" || locomotion !== "terrestrial";
}
