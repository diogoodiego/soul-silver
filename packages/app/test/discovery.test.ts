import type { SessionListing } from "@soulsilver/shared/lan";
import { afterEach, describe, expect, it } from "vitest";
import { broadcastAddresses, createDiscovery } from "../src/main/discovery";

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

describe("broadcastAddresses", () => {
  it("adds the directed broadcast of each external IPv4 interface", () => {
    const iface = (address: string, netmask: string, internal = false, family: "IPv4" | "IPv6" = "IPv4") => ({ address, netmask, internal, family, mac: "", cidr: null }) as never;
    const addresses = broadcastAddresses({
      Ethernet: [iface("192.168.1.20", "255.255.255.0")],
      Virtual: [iface("10.5.7.9", "255.255.0.0")],
      Loopback: [iface("127.0.0.1", "255.0.0.0", true)],
      V6: [iface("fe80::1", "ffff:ffff:ffff:ffff::", false, "IPv6")],
    });
    expect(addresses).toEqual(["255.255.255.255", "192.168.1.255", "10.5.255.255"]);
  });
});

describe("announce and watch", () => {
  const port = 47999;

  it("shows an announced session to a watcher on the same network", async () => {
    const log = () => {};
    const guestSide = createDiscovery({ localProtocolVersion: 4, appVersion: "0.5.0", port, log });
    const hostSide = createDiscovery({ localProtocolVersion: 4, appVersion: "0.5.0", port, targets: () => ["127.0.0.1"], log });
    let latest: SessionListing[] = [];
    stops.push(guestSide.watch((sessions) => (latest = sessions)));
    stops.push(hostSide.announce({ sessionId: "s1", hostName: "Gold", port: 47800, maxPlayers: 4, protocolVersion: 4, players: () => Promise.resolve(2) }));
    for (let i = 0; i < 100 && latest.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(latest).toEqual([expect.objectContaining({ hostName: "Gold", players: 2, maxPlayers: 4, address: "127.0.0.1:47800", joinable: true })]);
  });
});
