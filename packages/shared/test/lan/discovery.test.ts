import { describe, expect, it } from "vitest";
import { createSessionList, decodeAnnouncement, encodeAnnouncement, LAN_PORT_DISCOVERY, type Announcement } from "../../src/lan/discovery.ts";

const base: Announcement = {
  game: "soulsilver",
  v: 1,
  sessionId: "abc",
  hostName: "Gold",
  players: 2,
  maxPlayers: 4,
  protocolVersion: 4,
  appVersion: "0.5.0",
  port: 47800,
};
const packet = (a: unknown) => Buffer.from(JSON.stringify(a));

describe("announcement codec", () => {
  it("round-trips", () => {
    expect(decodeAnnouncement(encodeAnnouncement(base))).toEqual(base);
  });

  it("stays well under the 512-byte limit", () => {
    expect(encodeAnnouncement(base).length).toBeLessThan(512);
  });

  it.each([
    ["too big", Buffer.alloc(513, "a")],
    ["not json", Buffer.from("hello")],
    ["other game", packet({ ...base, game: "other" })],
    ["bad players", packet({ ...base, players: -1 })],
    ["extra field", packet({ ...base, extra: 1 })],
    ["bad port", packet({ ...base, port: 70000 })],
    ["empty host", packet({ ...base, hostName: "" })],
  ])("ignores %s", (_name, data) => {
    expect(decodeAnnouncement(data)).toBeUndefined();
  });

  it("uses the documented port", () => {
    expect(LAN_PORT_DISCOVERY).toBe(47801);
  });
});

describe("session list", () => {
  function setup(local = 4) {
    let now = 0;
    const list = createSessionList({ now: () => now, localProtocolVersion: local, localAppVersion: "0.6.0" });
    return { list, advance: (ms: number) => (now += ms) };
  }

  it("lists a joinable session with its address", () => {
    const { list } = setup();
    list.add(base, "192.168.0.5");
    expect(list.entries()).toEqual([{ ...base, address: "192.168.0.5:47800", joinable: true }]);
  });

  it("expires 4 s after the last packet and is kept alive by new ones", () => {
    const { list, advance } = setup();
    list.add(base, "192.168.0.5");
    advance(3900);
    list.add(base, "192.168.0.5");
    advance(3900);
    expect(list.entries()).toHaveLength(1);
    advance(200);
    expect(list.entries()).toHaveLength(0);
  });

  it("disables another protocol version with the reason", () => {
    const { list } = setup(5);
    list.add(base, "10.0.0.2");
    expect(list.entries()[0]).toMatchObject({ joinable: false, reason: "Versão 0.5.0, a sua é 0.6.0" });
  });

  it("disables a full session", () => {
    const { list } = setup();
    list.add({ ...base, players: 4 }, "10.0.0.2");
    expect(list.entries()[0]).toMatchObject({ joinable: false, reason: "Cheia" });
  });

  it("keeps two hosts with the same name apart", () => {
    const { list } = setup();
    list.add(base, "10.0.0.2");
    list.add({ ...base, sessionId: "def" }, "10.0.0.3");
    expect(list.entries().map((e) => e.address)).toEqual(["10.0.0.2:47800", "10.0.0.3:47800"]);
  });
});
