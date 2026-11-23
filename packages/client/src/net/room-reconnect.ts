import type { RoomError } from "./lobby";
import { roomError } from "./lobby";
import type { RoomJoined } from "./room-guest";

// O.6: a guest that entered by room gets back in on its own: it joins the same room again and redoes the
// WebRTC exchange, for up to two minutes. The host takes the player back by the rule the LAN uses
// (the reconnect token main keeps), so the guest's progress is the one the host last saved.

export const REJOIN_WINDOW_MS = 2 * 60_000;
export const REJOIN_RETRY_MS = 5_000;

/** Failures no retry fixes. */
const FINAL = new Set(["not-found", "closed", "room-full", "wrong-version", "invalid-code", "not-allowed"]);

export async function rejoinRoom(attempt: () => Promise<RoomJoined>, windowMs = REJOIN_WINDOW_MS, retryMs = REJOIN_RETRY_MS): Promise<RoomJoined> {
  const until = Date.now() + windowMs;
  for (;;) {
    try {
      return await attempt();
    } catch (e) {
      const reason = (e as Partial<RoomError>).reason;
      // The room closed during the drop: say that, not "not found".
      if (reason === "not-found") throw roomError("closed");
      if (reason && FINAL.has(reason)) throw e;
      if (Date.now() + retryMs > until) throw e;
      await new Promise((r) => setTimeout(r, retryMs));
    }
  }
}

export interface RoomReconnectDeps<Result> {
  /** One join of the room (findRoom + connect). */
  join: () => Promise<RoomJoined>;
  /** Hands the open channel to main (bridge + handToMain in peer.ts and peer-link.ts). */
  handOver: (joined: RoomJoined) => void;
  /** joinSession with the same slot and PEER_ADDRESS. */
  joinSession: () => Promise<Result>;
}

/** The whole reconnect; resolves with joinSession's result, or a reason to show. */
export async function reconnectViaRoom<Result>(deps: RoomReconnectDeps<Result>, windowMs?: number, retryMs?: number): Promise<Result | { ok: false; reason: string }> {
  let joined: RoomJoined;
  try {
    joined = await rejoinRoom(deps.join, windowMs, retryMs);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  deps.handOver(joined);
  return deps.joinSession();
}
