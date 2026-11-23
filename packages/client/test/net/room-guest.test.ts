import { beforeEach, describe, expect, it } from "vitest";
import { t } from "../../src/i18n";
import { listRooms } from "../../src/net/lobby";
import { enterRoom, findRoom, type RoomJoinOptions } from "../../src/net/room-guest";
import { hostRoom } from "../../src/net/room-host";
import { FakeLobby, FakeRtc, fakePort, settle } from "./fake-room";

// O.5: entering a room by code or from the public list.

const BASE = "https://lobby.test";
let lobby: FakeLobby;
let rtc: FakeRtc;

const opts = (code: string, over: Partial<RoomJoinOptions> = {}): RoomJoinOptions => ({
  lobbyUrl: BASE,
  code,
  playerName: "Lyra",
  appVersion: "0.5.3",
  protocolVersion: 49,
  sockets: lobby.sockets_,
  peers: rtc.factory,
  fetcher: lobby.fetch,
  ...over,
});

async function hosted(over: { hasPassword?: boolean; public?: boolean } = {}) {
  const room = hostRoom({
    lobbyUrl: BASE,
    roomName: "Sala do Gold",
    hostName: "Gold",
    appVersion: "0.5.3",
    protocolVersion: 49,
    public: over.public ?? true,
    hasPassword: over.hasPassword ?? false,
    openLink: () => Promise.resolve(fakePort().port),
    onChange: () => undefined,
    sockets: lobby.sockets_,
    peers: rtc.factory,
    timing: { heartbeatMs: 1000, openMs: 300 },
  });
  await settle();
  return room;
}

/** joinSession as main answers it: the host's game server checks the password. */
const session = (password: string) => (typed: string) => Promise.resolve(typed === password ? { ok: true as const, save: "save" } : { ok: false as const, reason: "Senha da sala incorreta." });

beforeEach(() => {
  lobby = new FakeLobby();
  rtc = new FakeRtc();
});

describe("the public list", () => {
  it("shows only public rooms on this game version", async () => {
    lobby.addRoom({ code: "AAAAAA" });
    lobby.addRoom({ code: "BBBBBB", protocolVersion: 48 });
    lobby.addRoom({ code: "CCCCCC", public: false });
    expect((await listRooms(BASE, 49, lobby.fetch)).map((r) => r.code)).toEqual(["AAAAAA"]);
  });

  it("fails with a clear message when the room server is down", async () => {
    lobby.up = false;
    await expect(listRooms(BASE, 49, lobby.fetch)).rejects.toThrow(t("rooms.unreachable"));
  });
});

describe("entering a room", () => {
  it("by code, typed any way, ends with the channel open and the room server left", async () => {
    const host = await hosted();
    const joined = await (await findRoom(opts(" k7p-2qx "))).connect();
    expect(joined.channel.readyState).toBe("open");
    expect(joined.room.code).toBe("K7P2QX");
    expect(joined.turn).toBe("ok");
    expect(lobby.sockets.filter((s) => s.role?.kind === "guest").every((s) => s.readyState === 3)).toBe(true);
    host.close();
  });

  it("from the list, with the code it shows", async () => {
    const host = await hosted();
    const [first] = await listRooms(BASE, 49, lobby.fetch);
    const joined = await (await findRoom(opts(first!.code))).connect();
    expect(joined.channel.readyState).toBe("open");
    host.close();
  });

  it("asks for the password when the room has one, and lets the host's server judge it", async () => {
    const host = await hosted({ hasPassword: true });
    let handed = 0;
    const deps = (password: string) => ({ find: () => findRoom(opts("K7P2QX")), password, handOver: () => handed++, joinSession: session("segredo") });
    expect(await enterRoom(deps(""))).toEqual({ ok: false, reason: t("rooms.needPassword") });
    expect(handed).toBe(0);
    expect(await enterRoom(deps("errada"))).toEqual({ ok: false, reason: "Senha da sala incorreta." });
    expect(await enterRoom(deps("segredo"))).toEqual({ ok: true, save: "save" });
    expect(handed).toBe(2);
    host.close();
  });

  it("refuses a malformed code, an unknown one and another version", async () => {
    lobby.addRoom({ code: "BBBBBB", protocolVersion: 48 });
    await expect(findRoom(opts("K7P"))).rejects.toThrow(t("rooms.invalidCode"));
    await expect(findRoom(opts("ZZZZZZ"))).rejects.toThrow(t("rooms.notFound"));
    await expect(findRoom(opts("BBBBBB"))).rejects.toThrow(t("rooms.wrongVersion"));
  });

  it("refuses a full room", async () => {
    lobby.addRoom({ code: "AAAAAA", players: 4 });
    await expect(findRoom(opts("AAAAAA"))).rejects.toThrow(t("rooms.full"));
    lobby.addRoom({ code: "BBBBBB", maxPlayers: 2 });
    const host = lobby.rooms.get("BBBBBB")!;
    host.guests.set("g9", lobby.sockets_("wss://lobby.test/x") as never);
    const join = await findRoom(opts("BBBBBB"));
    await expect(join.connect()).rejects.toThrow(t("rooms.full"));
  });

  it("says the room is gone when it closed between listing and entering", async () => {
    const host = await hosted();
    const listed = await listRooms(BASE, 49, lobby.fetch);
    expect(listed).toHaveLength(1);
    host.close();
    await settle();
    await expect(findRoom(opts(listed[0]!.code))).rejects.toThrow(t("rooms.notFound"));
    // Gone after the check but before the socket opened.
    const again = await hosted();
    const join = await findRoom(opts("AB3CD4"));
    again.close();
    await expect(join.connect()).rejects.toThrow(t("rooms.notFound"));
  });

  it("fails with a message pointing to the VPN guide when the link never opens", async () => {
    const host = await hosted();
    rtc.connects = false;
    const join = await findRoom(opts("K7P2QX", { openMs: 50 }));
    await expect(join.connect()).rejects.toThrow(t("rooms.connectFailed"));
    expect(t("rooms.connectFailed")).toMatch(/ZeroTier|Tailscale/u);
    host.close();
  });
});
