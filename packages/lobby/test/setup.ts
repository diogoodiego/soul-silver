import { beforeEach, vi } from "vitest";

// O.3: Cloudflare's TURN API, answered here so no test leaves the machine.
export const TURN_ANSWER = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "test-user", credential: "test-cred" },
  ],
};

export const turnCalls: Request[] = [];

beforeEach(() => {
  turnCalls.length = 0;
  const real = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const req = new Request(input, init);
    if (req.url.startsWith("https://rtc.live.cloudflare.com/")) {
      turnCalls.push(req);
      return Response.json(TURN_ANSWER, { status: 201 });
    }
    return real(input, init);
  });
});
