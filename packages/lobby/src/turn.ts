import { DEFAULT_STUN, type IceServer, type TurnStatus } from "@soulsilver/shared/lobby";

// O.3: TURN for players whose network blocks a direct link (4G, CGNAT). The key stays here: each room
// connection gets its own credentials, valid for TURN_TTL_S, tagged with the room code for usage reports.

export const TURN_TTL_S = 2 * 60 * 60;
const API = "https://rtc.live.cloudflare.com/v1/turn/keys";
/** How long a connection waits for Cloudflare before going on with STUN only. */
const API_TIMEOUT_MS = 3000;

export interface TurnKey {
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

interface ApiServer {
  urls: string | string[];
  username?: unknown;
  credential?: unknown;
}

/** The API's `iceServers`, or undefined when the answer is not that shape. */
function readAnswer(json: unknown): ApiServer[] | undefined {
  const list = (json as { iceServers?: unknown } | null)?.iceServers;
  if (!Array.isArray(list)) return undefined;
  const ok = list.every((s: unknown) => {
    const urls = (s as { urls?: unknown } | null)?.urls;
    return typeof urls === "string" || (Array.isArray(urls) && urls.every((u) => typeof u === "string"));
  });
  return ok ? (list as ApiServer[]) : undefined;
}

const STUN_ONLY: IceServer[] = [{ urls: DEFAULT_STUN }];

/** Browsers block port 53, and a URL on it only waits for a timeout. */
const usable = (url: string) => !/:53(\?|$)/u.test(url);

export async function iceServersFor(env: TurnKey, roomCode: string, fetcher: typeof fetch = fetch): Promise<{ iceServers: IceServer[]; turn: TurnStatus }> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return { iceServers: STUN_ONLY, turn: "off" };
  try {
    const res = await fetcher(`${API}/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TURN_TTL_S, customIdentifier: roomCode }),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`TURN API answered ${res.status}`);
    const servers = readAnswer(await res.json());
    if (!servers) throw new Error("TURN API answered in an unknown shape");
    const iceServers = servers
      .map((s): IceServer => {
        const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(usable);
        return { urls, ...(typeof s.username === "string" && { username: s.username }), ...(typeof s.credential === "string" && { credential: s.credential }) };
      })
      .filter((s) => s.urls.length > 0);
    if (iceServers.length === 0) throw new Error("TURN API gave no usable server");
    return { iceServers, turn: "ok" };
  } catch (e) {
    console.warn(`[turn] ${(e as Error).message}; this connection gets STUN only`);
    return { iceServers: STUN_ONLY, turn: "unavailable" };
  }
}
