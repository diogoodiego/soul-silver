import { beforeEach, describe, expect, it } from "vitest";
import { t } from "../../src/i18n";
import { findRoom } from "../../src/net/room-guest";
import { hostRoom } from "../../src/net/room-host";
import { reconnectViaRoom } from "../../src/net/room-reconnect";
import { FakeLobby, FakeRtc, fakePort, settle } from "./fake-room";

// O.6: a guest that came in by room gets back in by the same room, with no new invite.

const BASE = "https://lobby.test";
let lobby: FakeLobby;
let rtc: FakeRtc;

const join = () =>
  findRoom({ lobbyUrl: BASE, code: "K7P2QX", playerName: "Lyra", appVersion: "0.5.3", protocolVersion: 49, sockets: lobby.sockets_, peers: rtc.factory, fetcher: lobby.fetch }).then((j) => j.connect());

async function hosted() {
  const room = hostRoom({
    lobbyUrl: BASE,
    roomName: "Sala",
    hostName: "Gold",
    appVersion: "0.5.3",
    protocolVersion: 49,
    public: true,
    hasPassword: false,
    openLink: () => Promise.resolve(fakePort().port),
    onChange: () => undefined,
    sockets: lobby.sockets_,
    peers: rtc.factory,
    timing: { heartbeatMs: 1000, openMs: 300 },
  });
  await settle();
  return room;
}

beforeEach(() => {
  lobby = new FakeLobby();
  rtc = new FakeRtc();
});

describe("reconnecting by room", () => {
  it("after the data channel drops, joins again and rejoins the session with the same slot", async () => {
    const host = await hosted();
    const first = await join();
    first.channel.close();
    await settle();
    const calls: number[] = [];
    const saves = { 2: { trainer: "Lyra", badges: 1, x: 10 } };
    let handed: RTCDataChannel | undefined;
    const result = await reconnectViaRoom({
      join,
      handOver: (j) => (handed = j.channel),
      joinSession: () => {
        calls.push(2);
        return Promise.resolve({ ok: true as const, save: saves[2] });
      },
    });
    expect(handed?.readyState).toBe("open");
    expect(calls).toEqual([2]);
    // Progress: what the host's server handed back for this player, not a fresh start.
    expect(result).toEqual({ ok: true, save: { trainer: "Lyra", badges: 1, x: 10 } });
    host.close();
  });

  it("keeps trying while the room server is briefly away", async () => {
    const host = await hosted();
    lobby.up = false;
    setTimeout(() => (lobby.up = true), 40);
    const result = await reconnectViaRoom({ join, handOver: () => undefined, joinSession: () => Promise.resolve({ ok: true as const }) }, 1000, 20);
    expect(result).toEqual({ ok: true });
    host.close();
  });

  it("says the room closed when it did during the drop", async () => {
    const host = await hosted();
    await join();
    host.close();
    await settle();
    let joined = false;
    const result = await reconnectViaRoom({ join, handOver: () => undefined, joinSession: () => ((joined = true), Promise.resolve({ ok: true as const })) }, 1000, 20);
    expect(result).toEqual({ ok: false, reason: t("room.reconnectClosed") });
    expect(joined).toBe(false);
  });

  it("gives up after the window", async () => {
    lobby.up = false;
    const result = await reconnectViaRoom({ join, handOver: () => undefined, joinSession: () => Promise.resolve({ ok: true as const }) }, 50, 20);
    expect(result).toEqual({ ok: false, reason: t("rooms.unreachable") });
  });
});
