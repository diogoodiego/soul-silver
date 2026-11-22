import type { Action } from "@soulsilver/shared/input";

/** The options take the moves' buttons, as in a fight: the first is interact (A, move 1's button on the pad), then moves 2 and 3. */
export const NPC_KEYS: readonly Action[] = ["interact", "move2", "move3"];
