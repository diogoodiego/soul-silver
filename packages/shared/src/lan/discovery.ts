import { z } from "zod";
import { PLAYER_NAME_MAX } from "../game/limits.ts";

// LAN discovery (spec 012, contracts/lan-discovery.md): hosts broadcast this packet over UDP.

export const LAN_PORT_GAME = 47800;
export const LAN_PORT_DISCOVERY = 47801;
const MAX_PACKET_BYTES = 512;
const EXPIRY_MS = 4000;

const announcement = z.strictObject({
  game: z.literal("soulsilver"),
  v: z.literal(1),
  sessionId: z.string().min(1).max(64),
  hostName: z.string().min(1).max(PLAYER_NAME_MAX),
  players: z.number().int().nonnegative(),
  maxPlayers: z.number().int().positive(),
  protocolVersion: z.number().int().nonnegative(),
  appVersion: z.string().min(1).max(32),
  port: z.number().int().min(1).max(65535),
});
export type Announcement = z.infer<typeof announcement>;

export function encodeAnnouncement(a: Announcement): Buffer {
  return Buffer.from(JSON.stringify(a));
}

/** Anything that is not a valid announcement is ignored: the port is open to the whole LAN. */
export function decodeAnnouncement(data: Uint8Array): Announcement | undefined {
  if (data.length > MAX_PACKET_BYTES) return undefined;
  try {
    const parsed = announcement.safeParse(JSON.parse(Buffer.from(data).toString("utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export type SessionListing = Announcement & { address: string } & ({ joinable: true } | { joinable: false; reason: string });

export interface SessionListOptions {
  now(): number;
  localProtocolVersion: number;
  localAppVersion: string;
}

export function createSessionList(options: SessionListOptions) {
  const seen = new Map<string, { announcement: Announcement; ip: string; at: number }>();
  return {
    add(a: Announcement, ip: string): void {
      seen.set(`${ip}/${a.sessionId}`, { announcement: a, ip, at: options.now() });
    },
    entries(): SessionListing[] {
      const now = options.now();
      const out: SessionListing[] = [];
      for (const [key, e] of seen) {
        if (now - e.at >= EXPIRY_MS) {
          seen.delete(key);
          continue;
        }
        const a = e.announcement;
        const address = `${e.ip}:${a.port}`;
        if (a.protocolVersion !== options.localProtocolVersion) {
          out.push({ ...a, address, joinable: false, reason: `Versão ${a.appVersion}, a sua é ${options.localAppVersion}` });
        } else if (a.players >= a.maxPlayers) {
          out.push({ ...a, address, joinable: false, reason: "Cheia" });
        } else {
          out.push({ ...a, address, joinable: true });
        }
      }
      return out;
    },
  };
}
