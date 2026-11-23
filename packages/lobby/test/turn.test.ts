import { describe, expect, it } from "vitest";
import { DEFAULT_STUN } from "@soulsilver/shared/lobby";
import { iceServersFor, TURN_TTL_S } from "../src/turn.ts";

// O.3: short-lived TURN credentials from Cloudflare's API, generated with the key that never leaves the server.

const KEY = { TURN_KEY_ID: "key-123", TURN_KEY_API_TOKEN: "secret-token-abc" };
const answer = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    {
      urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
      username: "user-xyz",
      credential: "cred-xyz",
    },
  ],
};

function fakeFetch(respond: (req: Request) => Response | Promise<Response>) {
  const calls: Request[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push(req.clone());
    return respond(req);
  };
  return { fn: fn, calls };
}

describe("ICE servers for a room connection", () => {
  it("asks Cloudflare once, with a 2 h TTL and the room code, and drops port 53", async () => {
    const f = fakeFetch(() => Response.json(answer, { status: 201 }));
    const out = await iceServersFor(KEY, "K7P2QX", f.fn);
    expect(f.calls).toHaveLength(1);
    const req = f.calls[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key-123/credentials/generate-ice-servers");
    expect(req.headers.get("Authorization")).toBe("Bearer secret-token-abc");
    expect(await req.json()).toEqual({ ttl: TURN_TTL_S, customIdentifier: "K7P2QX" });
    expect(TURN_TTL_S).toBe(7200);
    expect(out.turn).toBe("ok");
    expect(out.iceServers).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
      { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "user-xyz", credential: "cred-xyz" },
    ]);
  });

  it("gives STUN only, without calling, when the key is not configured", async () => {
    const f = fakeFetch(() => Response.json(answer));
    for (const env of [{}, { TURN_KEY_ID: "key-123" }, { TURN_KEY_ID: "", TURN_KEY_API_TOKEN: "" }]) {
      expect(await iceServersFor(env, "K7P2QX", f.fn)).toEqual({ iceServers: [{ urls: DEFAULT_STUN }], turn: "off" });
    }
    expect(f.calls).toHaveLength(0);
  });

  it("falls back to STUN when the API fails, answers badly or throws", async () => {
    const failures = [
      () => new Response("nope", { status: 500 }),
      () => new Response("not json", { status: 201 }),
      () => Response.json({ iceServers: "x" }, { status: 201 }),
      () => {
        throw new Error("network down");
      },
    ];
    for (const respond of failures) {
      const out = await iceServersFor(KEY, "K7P2QX", fakeFetch(respond).fn);
      expect(out).toEqual({ iceServers: [{ urls: DEFAULT_STUN }], turn: "unavailable" });
    }
  });

  it("never puts the key in what it returns", async () => {
    const out = await iceServersFor(KEY, "K7P2QX", fakeFetch(() => Response.json(answer, { status: 201 })).fn);
    const text = JSON.stringify(out);
    expect(text).not.toContain(KEY.TURN_KEY_API_TOKEN);
    expect(text).not.toContain(KEY.TURN_KEY_ID);
  });
});
