import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STUN, isRoomCode, LOBBY_LIMITS, LOBBY_PROTOCOL } from "@soulsilver/shared/lobby";
import { TURN_ANSWER, turnCalls } from "./setup.ts";
import { connect, createMessage, expectType, hostRoom, joinMessage, joinRoom, request } from "./helpers.ts";

// O.1: the room server: rooms by code, a public list, and the relay of WebRTC connection messages.

const list = async (protocol: number | string) => {
  const res = await request(`/rooms?protocol=${protocol}`);
  return { status: res.status, body: await res.json<{ rooms?: { code: string; players: number }[] }>() };
};
const roomStub = (code: string) => env.ROOM.get(env.ROOM.idFromName(code));

describe("creating a room", () => {
  it("gives a code, a host token and the room data", async () => {
    const { created } = await hostRoom();
    expect(isRoomCode(created.code)).toBe(true);
    expect(created.hostToken).toMatch(/.{20,}/);
    expect(created.room).toMatchObject({ code: created.code, roomName: "Sala do Gold", hostName: "Gold", players: 1, maxPlayers: 4 });
  });

  it("lists a public room under its protocol version only", async () => {
    const { code } = await hostRoom({}, "198.51.100.10");
    const { code: hidden } = await hostRoom({ public: false }, "198.51.100.11");
    const { code: other } = await hostRoom({ protocolVersion: 47 }, "198.51.100.12");
    const at48 = (await list(48)).body.rooms!.map((r) => r.code);
    expect(at48).toContain(code);
    expect(at48).not.toContain(hidden);
    expect(at48).not.toContain(other);
    expect((await list(47)).body.rooms!.map((r) => r.code)).toEqual([other]);
  });

  it("answers the list with CORS and rejects a missing protocol", async () => {
    const res = await request("/rooms?protocol=48");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await list("x")).status).toBe(400);
  });

  it("updates the player count in the list", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.20");
    host.send({ type: "update", players: 3 });
    host.send({ type: "heartbeat" });
    await new Promise((r) => setTimeout(r, 50));
    const room = (await list(48)).body.rooms!.find((r) => r.code === code);
    expect(room?.players).toBe(3);
  });

  it("removes the room when the host closes it", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.21");
    const { guest } = await joinRoom(host, code);
    host.send({ type: "close" });
    expect(await expectType(guest, "room-closed")).toEqual({ type: "room-closed", reason: "closed" });
    expect((await list(48)).body.rooms!.map((r) => r.code)).not.toContain(code);
    expect((await request(`/join/${code}`, { headers: { Upgrade: "websocket" } })).status).toBe(404);
  });
});

describe("joining and relaying", () => {
  it("relays signals both ways with two guests, each to the right peer", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.30");
    const a = await joinRoom(host, code, "Lyra");
    const b = await joinRoom(host, code, "Ethan");
    expect(a.joined.room.code).toBe(code);
    expect(a.notice.playerName).toBe("Lyra");
    expect(a.joined.guestId).not.toBe(b.joined.guestId);

    a.guest.send({ type: "signal", data: { sdp: "offer-a" } });
    expect(await expectType(host, "signal")).toEqual({ type: "signal", from: a.joined.guestId, data: { sdp: "offer-a" } });
    b.guest.send({ type: "signal", data: { sdp: "offer-b" } });
    expect(await expectType(host, "signal")).toEqual({ type: "signal", from: b.joined.guestId, data: { sdp: "offer-b" } });

    host.send({ type: "signal", to: b.joined.guestId, data: { sdp: "answer-b" } });
    expect(await expectType(b.guest, "signal")).toEqual({ type: "signal", from: "host", data: { sdp: "answer-b" } });
    host.send({ type: "signal", to: a.joined.guestId, data: { candidate: "c1" } });
    expect(await expectType(a.guest, "signal")).toEqual({ type: "signal", from: "host", data: { candidate: "c1" } });
  });

  it("tells the host when a guest leaves", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.31");
    const { guest, joined } = await joinRoom(host, code);
    guest.ws.close(1000);
    expect(await expectType(host, "guest-left")).toEqual({ type: "guest-left", guestId: joined.guestId });
  });

  it("refuses an unknown code", async () => {
    expect((await request("/join/ZZZZZZ", { headers: { Upgrade: "websocket" } })).status).toBe(404);
    expect((await request("/join/not-a-code", { headers: { Upgrade: "websocket" } })).status).toBe(404);
  });

  it("refuses a full room", async () => {
    const { host, code } = await hostRoom({ maxPlayers: 2 }, "198.51.100.32");
    await joinRoom(host, code);
    const late = await connect(`/join/${code}`);
    late.send(joinMessage(code));
    expect(await expectType(late, "error")).toMatchObject({ code: "room-full" });
  });

  it("refuses a guest on another protocol version", async () => {
    const { code } = await hostRoom({}, "198.51.100.33");
    const guest = await connect(`/join/${code}`);
    guest.send(joinMessage(code, { protocolVersion: 47 }));
    expect(await expectType(guest, "error")).toMatchObject({ code: "wrong-version" });
  });

  it("refuses a join with another room's code", async () => {
    const { code } = await hostRoom({}, "198.51.100.34");
    const guest = await connect(`/join/${code}`);
    guest.send(joinMessage(code === "AAAAAA" ? "BBBBBB" : "AAAAAA"));
    expect(await expectType(guest, "error")).toMatchObject({ code: "malformed" });
  });

  it("refuses a signal to a guest that is not there", async () => {
    const { host } = await hostRoom({}, "198.51.100.35");
    host.send({ type: "signal", to: "g99", data: {} });
    expect(await expectType(host, "error")).toMatchObject({ code: "not-found" });
  });
});

describe("expiry", () => {
  it("closes a room whose host stopped sending heartbeats", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.40");
    const { guest } = await joinRoom(host, code);
    const stub = roomStub(code);
    await runInDurableObject(stub, async (_room, state) => {
      await state.storage.put("lastHeartbeat", Date.now() - LOBBY_LIMITS.heartbeatTimeoutMs - 1);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await expectType(guest, "room-closed")).toMatchObject({ reason: "expired" });
    expect((await list(48)).body.rooms!.map((r) => r.code)).not.toContain(code);
    await runInDurableObject(stub, async (_room, state) => {
      expect([...(await state.storage.list()).keys()]).toEqual([]);
    });
  });

  it("keeps a room whose host is on time", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.41");
    host.send({ type: "heartbeat" });
    await new Promise((r) => setTimeout(r, 20));
    const stub = roomStub(code);
    await runDurableObjectAlarm(stub);
    expect((await list(48)).body.rooms!.map((r) => r.code)).toContain(code);
  });

  it("closes a room without guests for an hour", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.42");
    const stub = roomStub(code);
    await runInDurableObject(stub, async (_room, state) => {
      await state.storage.put("emptySince", Date.now() - LOBBY_LIMITS.idleRoomMs - 1);
    });
    await runDurableObjectAlarm(stub);
    expect(await expectType(host, "room-closed")).toMatchObject({ reason: "idle" });
  });

  it("drops the list entry of a room that stopped refreshing it", async () => {
    const { code } = await hostRoom({}, "198.51.100.43");
    const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName("directory"));
    await runInDurableObject(dir, (_d, state) => {
      state.storage.sql.exec("UPDATE rooms SET updated_at = ? WHERE code = ?", Date.now() - LOBBY_LIMITS.heartbeatTimeoutMs - 1, code);
    });
    expect((await list(48)).body.rooms!.map((r) => r.code)).not.toContain(code);
  });
});

describe("limits and bad input", () => {
  it("allows three rooms per address every ten minutes", async () => {
    const ip = "192.0.2.50";
    for (let i = 0; i < LOBBY_LIMITS.roomsPerIp; i++) await hostRoom({}, ip);
    const res = await request("/host", { headers: { Upgrade: "websocket", "CF-Connecting-IP": ip } });
    expect(res.status).toBe(429);
    expect((await res.json<{ code: string }>()).code).toBe("too-many-rooms");
    await hostRoom({}, "192.0.2.51");
  });

  it("caps signals per second per connection", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.60");
    const { guest } = await joinRoom(host, code);
    for (let i = 0; i < LOBBY_LIMITS.signalsPerSecond + 5; i++) guest.send({ type: "signal", data: { i } });
    const seen: string[] = [];
    for (let i = 0; i < LOBBY_LIMITS.signalsPerSecond; i++) seen.push((await host.next()).type);
    expect(seen.every((t) => t === "signal")).toBe(true);
    expect(await expectType(guest, "error")).toMatchObject({ code: "rate-limited" });
  });

  it("rejects messages over 16 KB and closes the socket", async () => {
    const { host } = await hostRoom({}, "198.51.100.61");
    host.send({ type: "signal", to: "g1", data: "x".repeat(LOBBY_LIMITS.maxMessageBytes) });
    expect(await expectType(host, "error")).toMatchObject({ code: "too-large" });
    expect(await host.closed).toBe(1009);
  });

  it("answers malformed messages without dropping the connection", async () => {
    const { host } = await hostRoom({}, "198.51.100.62");
    host.sendRaw("{not json");
    expect(await expectType(host, "error")).toMatchObject({ code: "malformed" });
    host.send({ type: "update", players: 99 });
    expect(await expectType(host, "error")).toMatchObject({ code: "malformed" });
    host.send({ type: "heartbeat" });
    host.send({ type: "signal", to: "g1", data: 1 });
    expect(await expectType(host, "error")).toMatchObject({ code: "not-found" });
  });

  it("keeps each side to its own messages", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.63");
    const { guest } = await joinRoom(host, code);
    guest.send({ type: "close" });
    expect(await expectType(guest, "error")).toMatchObject({ code: "not-allowed" });
    host.send(createMessage());
    expect(await expectType(host, "error")).toMatchObject({ code: "not-allowed" });
    const early = await connect(`/join/${code}`);
    early.send({ type: "signal", data: {} });
    expect(await expectType(early, "error")).toMatchObject({ code: "not-allowed" });
  });

  it("refuses plain HTTP on the socket routes and unknown paths", async () => {
    expect((await request("/host")).status).toBe(426);
    expect((await request("/nothing")).status).toBe(404);
  });
});

describe("ICE servers in the room messages", () => {
  it("hands TURN credentials to the host and each guest, one request per connection, without the key", async () => {
    const { host, code, created } = await hostRoom({}, "198.51.100.70");
    const { joined } = await joinRoom(host, code);
    for (const m of [created, joined]) {
      expect(m.turn).toBe("ok");
      expect(m.iceServers).toEqual(TURN_ANSWER.iceServers);
      expect(JSON.stringify(m)).not.toContain("test-key-token");
      expect(JSON.stringify(m)).not.toContain("test-key-id");
    }
    expect(turnCalls).toHaveLength(2);
    expect(turnCalls.every((r) => r.url.includes("/test-key-id/"))).toBe(true);
  });

  it("goes on with STUN only and a warning when the TURN API fails", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(() => Promise.resolve(new Response("down", { status: 503 })));
    const { created } = await hostRoom({}, "198.51.100.71");
    expect(created.turn).toBe("unavailable");
    expect(created.iceServers).toEqual([{ urls: DEFAULT_STUN }]);
  });
});

describe("host taking its room back", () => {
  it("resumes the same code with the host token, and relays again", async () => {
    const { host, code, created } = await hostRoom({}, "198.51.100.80");
    host.ws.close(1000);
    await new Promise((r) => setTimeout(r, 20));
    const back = await connect(`/host/${code}`);
    back.send({ type: "resume", lobbyProtocol: LOBBY_PROTOCOL, code, hostToken: created.hostToken });
    const resumed = await expectType(back, "resumed");
    expect(resumed.room.code).toBe(code);
    expect(resumed.turn).toBe("ok");
    const { joined } = await joinRoom(back, code);
    back.send({ type: "signal", to: joined.guestId, data: { sdp: "offer" } });
    expect((await list(48)).body.rooms!.map((r) => r.code)).toContain(code);
  });

  it("refuses a wrong token and an unknown room", async () => {
    const { code } = await hostRoom({}, "198.51.100.81");
    const intruder = await connect(`/host/${code}`);
    intruder.send({ type: "resume", lobbyProtocol: LOBBY_PROTOCOL, code, hostToken: "not-the-token" });
    expect(await expectType(intruder, "error")).toMatchObject({ code: "not-allowed" });
    expect((await request("/host/ZZZZZZ", { headers: { Upgrade: "websocket" } })).status).toBe(404);
  });
});

describe("a room whose guests play over their data channel", () => {
  it("is not idle while the host reports more than one player", async () => {
    const { host, code } = await hostRoom({}, "198.51.100.90");
    const { guest } = await joinRoom(host, code);
    host.send({ type: "update", players: 2 });
    guest.ws.close(1000);
    await expectType(host, "guest-left");
    const stub = roomStub(code);
    await runInDurableObject(stub, async (_room, state) => {
      expect(await state.storage.get("emptySince")).toBeUndefined();
    });
    host.send({ type: "update", players: 1 });
    await new Promise((r) => setTimeout(r, 20));
    await runInDurableObject(stub, async (_room, state) => {
      expect(await state.storage.get("emptySince")).toBeTypeOf("number");
    });
  });
});

describe("looking up one room", () => {
  it("answers an open room by code, public or not, and 404 otherwise", async () => {
    const { code } = await hostRoom({ public: false, hasPassword: true }, "198.51.100.95");
    const res = await request(`/rooms/${code}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await res.json<{ room: { code: string; hasPassword: boolean; protocolVersion: number } }>()).room).toMatchObject({ code, hasPassword: true, protocolVersion: 48 });
    expect((await request("/rooms/ZZZZZZ")).status).toBe(404);
    expect((await request("/rooms/bad")).status).toBe(404);
  });
});
