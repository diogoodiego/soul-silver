import { generateRoomCode, isRoomCode } from "@soulsilver/shared/lobby";
import { directory } from "./directory.ts";

// O.1: the room server's entry point.
//   GET /rooms?protocol=<n>  public rooms on that game protocol version
//   GET /rooms/<code>        one room's data, public or not (the code is what lets anyone in)
//   GET /host                WebSocket for a host; the first message is `create`
//   GET /host/<code>         WebSocket for a host taking its room back; the first message is `resume`
//   GET /join/<code>         WebSocket for a guest; the first message is `join`

export { Directory } from "./directory.ts";
export { Room } from "./room.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

/** Addresses are kept only as hashes, and only to count rooms per address. */
async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`soulsilver-lobby:${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function roomStub(env: Cloudflare.Env, code: string) {
  return env.ROOM.get(env.ROOM.idFromName(code));
}

function forward(request: Request, role: "host" | "host-resume" | "guest", code: string): Request {
  const headers = new Headers(request.headers);
  headers.set("X-Lobby-Role", role);
  headers.set("X-Lobby-Code", code);
  return new Request(request.url, { headers });
}

async function host(request: Request, env: Cloudflare.Env): Promise<Response> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await directory(env).reserve(await hashIp(ip)))) {
    return json({ code: "too-many-rooms", message: "too many rooms from this address; try again later" }, 429);
  }
  // A code already in use answers 409; with 31^6 codes a second draw almost never happens.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const res = await roomStub(env, code).fetch(forward(request, "host", code));
    if (res.status !== 409) return res;
  }
  return json({ code: "busy", message: "no free room code" }, 503);
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET" } });
    if (request.method !== "GET") return json({ code: "not-allowed" }, 405);

    if (url.pathname === "/rooms") {
      const protocol = Number(url.searchParams.get("protocol"));
      if (!url.searchParams.has("protocol") || !Number.isInteger(protocol) || protocol < 0) {
        return json({ code: "malformed", message: "protocol must be a non-negative integer" }, 400);
      }
      return json({ rooms: await directory(env).list(protocol) });
    }

    const one = /^\/rooms\/([^/]+)$/u.exec(url.pathname);
    if (one) {
      const info = isRoomCode(one[1]!) ? await roomStub(env, one[1]!).info() : undefined;
      return info ? json({ room: info }) : json({ code: "not-found" }, 404);
    }

    const route = /^\/(host|join)(?:\/([^/]+))?$/u.exec(url.pathname);
    if (!route || (route[1] === "join" && !route[2])) return json({ code: "not-found" }, 404);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ code: "upgrade-required", message: "this route takes a WebSocket" }, 426);
    }
    const code = route[2];
    if (code === undefined) return host(request, env);
    if (!isRoomCode(code)) return json({ code: "not-found" }, 404);
    return roomStub(env, code).fetch(forward(request, route[1] === "host" ? "host-resume" : "guest", code));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
