import { beforeEach, describe, expect, it } from "vitest";
import { t } from "../../src/i18n";
import { hostRoom, type RoomHostOptions, type RoomHostState } from "../../src/net/room-host";
import { findRoom } from "../../src/net/room-guest";
import { FakeLobby, FakeRtc, fakePort, ICE, settle } from "./fake-room";

// O.4: hosting an online room: the room server introduces guests, the host opens one connection per guest.

const BASE = "https://lobby.test";
let lobby: FakeLobby;
let rtc: FakeRtc;
let states: RoomHostState[];
let links: number;

function host(over: Partial<RoomHostOptions> = {}) {
  return hostRoom({
    lobbyUrl: BASE,
    roomName: "Sala do Gold",
    hostName: "Gold",
    appVersion: "0.5.3",
    protocolVersion: 49,
    public: true,
    hasPassword: false,
    openLink: () => {
      links++;
      return Promise.resolve(fakePort().port);
    },
    onChange: (s) => states.push(s),
    sockets: lobby.sockets_,
    peers: rtc.factory,
    probe: () => Promise.resolve(lobby.up),
    timing: { heartbeatMs: 30, openMs: 200, connectMs: 500, retryMs: [5, 5], roomLostMs: 1000 },
    ...over,
  });
}

const guest = (code: string, name: string) =>
  findRoom({ lobbyUrl: BASE, code, playerName: name, appVersion: "0.5.3", protocolVersion: 49, sockets: lobby.sockets_, peers: rtc.factory, fetcher: lobby.fetch }).then((j) => j.connect());

beforeEach(() => {
  lobby = new FakeLobby();
  rtc = new FakeRtc();
  states = [];
  links = 0;
});

describe("hosting a room", () => {
  it("creates the room and keeps it alive", async () => {
    const room = host();
    await settle();
    expect(room.state).toMatchObject({ status: "open", code: "K7P2QX", turn: "ok" });
    expect(lobby.sent("create")[0]).toMatchObject({ roomName: "Sala do Gold", hostName: "Gold", protocolVersion: 49, maxPlayers: 4, public: true, hasPassword: false });
    room.setPlayers(2);
    await new Promise((r) => setTimeout(r, 80));
    expect(lobby.sent("heartbeat").length).toBeGreaterThanOrEqual(2);
    expect(lobby.rooms.get("K7P2QX")?.info.players).toBe(2);
    room.close();
  });

  it("connects two guests at once, each on its own connection with the room server's ICE servers", async () => {
    const room = host();
    await settle();
    const [a, b] = await Promise.all([guest("K7P-2QX", "Lyra"), guest("k7p2qx", "Ethan")]);
    await settle();
    expect(a.channel.readyState).toBe("open");
    expect(b.channel.readyState).toBe("open");
    expect(links).toBe(2);
    expect(room.state.guests.map((g) => [g.name, g.state]).sort()).toEqual([["Ethan", "connected"], ["Lyra", "connected"]]);
    const hostPcs = rtc.pcs.filter((p) => p.channel && p.localDescription?.type === "offer");
    expect(hostPcs).toHaveLength(2);
    for (const pc of rtc.pcs) expect(pc.config.iceServers).toEqual(ICE);
    // Candidates went both ways through the room server (trickle).
    expect(lobby.sent("signal").some((m) => m.type === "signal" && "candidate" in (m.data as object))).toBe(true);
    room.close();
  });

  it("drops a guest that leaves, before and after connecting", async () => {
    const room = host();
    await settle();
    rtc.connects = false;
    const pending = findRoom({ lobbyUrl: BASE, code: "K7P2QX", playerName: "Lyra", appVersion: "0.5.3", protocolVersion: 49, sockets: lobby.sockets_, peers: rtc.factory, fetcher: lobby.fetch });
    const join = await pending;
    void join.connect().catch(() => undefined);
    await settle();
    expect(room.state.guests).toEqual([{ id: "g1", name: "Lyra", state: "connecting" }]);
    join.cancel();
    await settle();
    expect(room.state.guests).toEqual([]);

    rtc.connects = true;
    const b = await guest("K7P2QX", "Ethan");
    await settle();
    expect(room.state.guests.map((g) => g.state)).toEqual(["connected"]);
    b.channel.close();
    await settle();
    expect(room.state.guests).toEqual([]);
    room.close();
  });

  it("marks a guest whose connection never opens as failed", async () => {
    const room = host();
    await settle();
    rtc.connects = false;
    const join = await findRoom({ lobbyUrl: BASE, code: "K7P2QX", playerName: "Lyra", appVersion: "0.5.3", protocolVersion: 49, sockets: lobby.sockets_, peers: rtc.factory, fetcher: lobby.fetch, openMs: 5000 });
    void join.connect().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 260));
    expect(room.state.guests).toEqual([{ id: "g1", name: "Lyra", state: "failed" }]);
    room.close();
    join.cancel();
  });

  it("closes the room on the server and keeps guests already playing", async () => {
    const room = host();
    await settle();
    const a = await guest("K7P2QX", "Lyra");
    await settle();
    room.close();
    await settle();
    expect(lobby.sent("close")).toHaveLength(1);
    expect(lobby.rooms.has("K7P2QX")).toBe(false);
    expect(room.state.status).toBe("closed");
    expect(a.channel.readyState).toBe("open");
  });

  it("says clearly when the room server is out of reach", async () => {
    lobby.up = false;
    const room = host();
    await settle();
    expect(room.state).toMatchObject({ status: "error", message: t("room.unreachable") });
  });

  it("gets back to the room server with the same code, without dropping who is playing", async () => {
    const room = host();
    await settle();
    const a = await guest("K7P2QX", "Lyra");
    await settle();
    lobby.sockets.find((s) => s.role?.kind === "host")!.drop();
    await settle(2);
    expect(room.state.status).toBe("reconnecting");
    await new Promise((r) => setTimeout(r, 30));
    await settle();
    expect(room.state).toMatchObject({ status: "open", code: "K7P2QX" });
    expect(lobby.sent("resume")[0]).toMatchObject({ code: "K7P2QX", hostToken: "token-K7P2QX" });
    expect(a.channel.readyState).toBe("open");
    // A new guest still gets in after the comeback.
    const b = await guest("K7P2QX", "Ethan");
    expect(b.channel.readyState).toBe("open");
    room.close();
  });

  it("makes a new room, and says so, when the old one expired while away", async () => {
    const room = host({ timing: { heartbeatMs: 30, openMs: 200, connectMs: 500, retryMs: [5, 5], roomLostMs: 0 } });
    await settle();
    lobby.closeRoom("K7P2QX", "expired");
    lobby.sockets.find((s) => s.role?.kind === "host")!.drop();
    await new Promise((r) => setTimeout(r, 30));
    await settle();
    expect(room.state).toMatchObject({ status: "open", code: "AB3CD4", message: t("room.newCode", { code: "AB3CD4" }) });
    room.close();
  });

  it("reports a TURN outage", async () => {
    lobby.turn = "unavailable";
    const room = host();
    await settle();
    expect(room.state.turn).toBe("unavailable");
    room.close();
  });
});
