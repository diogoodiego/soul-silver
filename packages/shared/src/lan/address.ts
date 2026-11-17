import { LAN_PORT_GAME } from "./discovery.ts";

/** True for a valid IPv6 address (no zone); the platform's URL parser does the checking, in Node and in the renderer. */
function isIpv6(host: string): boolean {
  if (!host.includes(":")) return false;
  try {
    new URL(`http://[${host}]/`);
    return true;
  } catch {
    return false;
  }
}

/** Accepts `host` or `host:port` (IPv4 or a name), and IPv6 as `addr`, `[addr]` or `[addr]:port` (R.2). */
export function parseAddress(text: string): { host: string; port: number } | undefined {
  const trimmed = text.trim();
  const match = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(trimmed) ?? (isIpv6(trimmed) ? [trimmed, trimmed] : /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(trimmed));
  if (!match) return undefined;
  const host = match[1];
  if (trimmed.startsWith("[") && !isIpv6(host)) return undefined;
  const port = match[2] ? Number(match[2]) : LAN_PORT_GAME;
  return port >= 1 && port <= 65535 ? { host, port } : undefined;
}

/** `host:port` ready for a URL: IPv6 goes in brackets. */
export function urlHost(host: string, port: number): string {
  return `${host.includes(":") ? `[${host}]` : host}:${port}`;
}
