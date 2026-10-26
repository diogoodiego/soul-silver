import { LAN_PORT_GAME } from "./discovery.ts";

/** Accepts `host` or `host:port` (IPv4 or a name). */
export function parseAddress(text: string): { host: string; port: number } | undefined {
  const match = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(text.trim());
  if (!match) return undefined;
  const port = match[2] ? Number(match[2]) : LAN_PORT_GAME;
  return port >= 1 && port <= 65535 ? { host: match[1]!, port } : undefined;
}
