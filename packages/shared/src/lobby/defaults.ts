// O.2: where the app finds the room server and its STUN by default; both can be changed in the settings.

/** The Worker `soulsilver-lobby` on the developer's workers.dev subdomain (see .github/workflows/lobby.yml). */
export const DEFAULT_LOBBY_URL = "https://soulsilver-lobby.diogo-soul-silver.workers.dev";

/** Cloudflare's STUN, the same the room server hands out with TURN credentials. */
export const DEFAULT_STUN = "stun:stun.cloudflare.com:3478";

/** The WebSocket URL for a room server route, from its http(s) base address. */
export function lobbySocketUrl(base: string, path: string): string {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  return url.toString();
}
