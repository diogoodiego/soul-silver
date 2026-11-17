import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { createSessionList, decodeAnnouncement, encodeAnnouncement, LAN_PORT_DISCOVERY, LAN_PORT_GAME, type Announcement, type SessionListing } from "@soulsilver/shared/lan";

// LAN discovery over UDP broadcast (spec 012, research R2, contracts/lan-discovery.md).

const INTERVAL_MS = 1000;

/** Global unicast IPv6 (2000::/3): reachable from the internet; link-local and unique-local stay out (R.2). */
const isGlobalIpv6 = (address: string) => (Number.parseInt(address.split(":")[0]!, 16) & 0xe000) === 0x2000;

/** How others reach this PC: each external IPv4 address, then each global IPv6 one in brackets, with the port when it is not the default. */
export function localAddresses(port: number, interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  const all = Object.values(interfaces).flatMap((infos) => (infos ?? []).filter((i) => !i.internal));
  const v4 = all.filter((i) => i.family === "IPv4").map((i) => i.address);
  const v6 = all.filter((i) => i.family === "IPv6" && isGlobalIpv6(i.address)).map((i) => `[${i.address}]`);
  return [...v4, ...v6].map((ip) => (port === LAN_PORT_GAME ? ip : `${ip}:${port}`));
}

/** The limited broadcast plus the directed broadcast of every external IPv4 interface. */
export function broadcastAddresses(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  const out = new Set(["255.255.255.255"]);
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      const ip = info.address.split(".").map(Number);
      const mask = info.netmask.split(".").map(Number);
      out.add(ip.map((octet, i) => (octet | (~mask[i]! & 255)) & 255).join("."));
    }
  }
  return [...out];
}

export interface DiscoveryOptions {
  localProtocolVersion: number;
  appVersion: string;
  /** Overridden in tests. */
  port?: number;
  targets?: () => string[];
  now?: () => number;
  log: (message: string) => void;
}

export interface HostAnnouncement {
  sessionId: string;
  hostName: string;
  /** Game socket port. */
  port: number;
  maxPlayers: number;
  protocolVersion: number;
  /** Players now, asked every second. */
  players(): Promise<number>;
}

export function createDiscovery(options: DiscoveryOptions) {
  const port = options.port ?? LAN_PORT_DISCOVERY;
  const now = options.now ?? Date.now;

  return {
    /** Starts announcing; returns a function that stops. */
    announce(host: HostAnnouncement): () => void {
      const socket: Socket = createSocket("udp4");
      let stopped = false;
      socket.on("error", (error) => {
        options.log(`Announcer: ${error.message}`);
      });
      socket.bind(0, () => {
        if (!stopped) socket.setBroadcast(true);
      });
      const send = async () => {
        let players: number;
        try {
          players = await host.players();
        } catch {
          return;
        }
        if (stopped) return;
        const packet: Announcement = {
          game: "soulsilver",
          v: 1,
          sessionId: host.sessionId,
          hostName: host.hostName,
          players,
          maxPlayers: host.maxPlayers,
          protocolVersion: host.protocolVersion,
          appVersion: options.appVersion,
          port: host.port,
        };
        const data = encodeAnnouncement(packet);
        for (const target of options.targets?.() ?? broadcastAddresses()) {
          socket.send(data, port, target, (error) => {
            if (error && !stopped) options.log(`Announcer: ${target}: ${error.message}`);
          });
        }
      };
      const timer = setInterval(() => void send(), INTERVAL_MS);
      void send();
      return () => {
        stopped = true;
        clearInterval(timer);
        socket.close();
      };
    },

    /** Starts listening for announcements; returns a function that stops. */
    watch(listener: (sessions: SessionListing[]) => void): () => void {
      const list = createSessionList({ now, localProtocolVersion: options.localProtocolVersion, localAppVersion: options.appVersion });
      const socket = createSocket({ type: "udp4", reuseAddr: true });
      socket.on("error", (error) => {
        options.log(`Listener: ${error.message}`);
      });
      socket.on("message", (data, remote) => {
        const announcement = decodeAnnouncement(data);
        if (!announcement) return;
        list.add(announcement, remote.address);
        listener(list.entries());
      });
      socket.bind(port);
      // Entries expire without a packet to trigger an update.
      const timer = setInterval(() => {
        listener(list.entries());
      }, INTERVAL_MS);
      return () => {
        clearInterval(timer);
        socket.close();
      };
    },
  };
}
