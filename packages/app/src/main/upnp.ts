import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { LAN_PORT_GAME } from "@soulsilver/shared/lan";

// R.5: asks the home router (UPnP Internet Gateway Device) to forward the game port to this PC, so friends
// outside the LAN join by the public IP. Only SSDP (UDP) and SOAP (HTTP), no dependency.

const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
const SEARCH_MS = 3000;
const HTTP_MS = 4000;
/** Mappings expire on their own if the app dies without removing them; renewed at half the lease. */
export const LEASE_S = 3600;
const SERVICES = ["urn:schemas-upnp-org:service:WANIPConnection:2", "urn:schemas-upnp-org:service:WANIPConnection:1", "urn:schemas-upnp-org:service:WANPPPConnection:1"];

const NO_ROUTER = "O roteador não respondeu ao UPnP. Ative o UPnP no roteador ou use o convite pela internet.";
const NO_SERVICE = "O roteador respondeu, mas não deixa abrir portas por UPnP. Use o convite pela internet.";
const CGNAT = "Sua operadora não dá um IP público ao roteador (CGNAT, comum em 4G e em algumas fibras): amigos de fora não chegam por endereço. Use o convite pela internet.";
const TAKEN = "A porta já está aberta no roteador para outro computador. Feche o jogo nele ou use o convite pela internet.";

class UpnpError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`O roteador recusou abrir a porta (erro UPnP ${code}). Use o convite pela internet.`);
    this.code = code;
  }
}

export function ssdpLocation(response: string): string | undefined {
  return /^location:\s*(\S+)/im.exec(response)?.[1];
}

export interface WanService {
  type: string;
  controlUrl: string;
}

/** The WAN connection service of a device description, preferring IGD v2, with its control URL made absolute. */
export function findService(xml: string, base: string): WanService | undefined {
  const blocks = xml.match(/<service>[\s\S]*?<\/service>/gi) ?? [];
  for (const type of SERVICES) {
    for (const block of blocks) {
      if (!block.includes(`<serviceType>${type}</serviceType>`)) continue;
      const control = /<controlURL>\s*([^<]+?)\s*<\/controlURL>/i.exec(block)?.[1];
      if (control) return { type, controlUrl: new URL(control, base).href };
    }
  }
  return undefined;
}

/** False for private, carrier-NAT (100.64/10), loopback, link-local and malformed addresses. */
export function isPublicIpv4(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = o as [number, number];
  return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
}

/**
 * The router's description URL. The search goes out on every external IPv4 interface: with a VPN adapter
 * (Radmin, Hamachi, ZeroTier) Windows sends multicast through the VPN, and the home router never hears it.
 */
export function searchRouter(ms: number, target = SSDP_ADDRESS): Promise<string> {
  const bindings = [...new Set(Object.values(networkInterfaces()).flatMap((infos) => (infos ?? []).filter((i) => i.family === "IPv4" && !i.internal).map((i) => i.address)))];
  return new Promise((resolve, reject) => {
    const sockets = (bindings.length > 0 ? bindings : [undefined]).map(() => createSocket("udp4"));
    const done = (location?: string) => {
      clearTimeout(timer);
      for (const s of sockets) s.close();
      if (location) resolve(location);
      else reject(new Error(NO_ROUTER));
    };
    const timer = setTimeout(() => done(), ms);
    const request = ["M-SEARCH * HTTP/1.1", `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`, 'MAN: "ssdp:discover"', "MX: 2", "ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1", "", ""].join("\r\n");
    sockets.forEach((socket, i) => {
      const address = bindings[i];
      // One interface failing (a VPN that is down) leaves the others searching.
      socket.on("error", () => {});
      socket.on("message", (msg) => {
        const location = ssdpLocation(msg.toString());
        if (location) done(location);
      });
      socket.bind(0, address, () => {
        if (address) socket.setMulticastInterface(address);
        socket.send(request, SSDP_PORT, target);
      });
    });
  });
}

/** This PC's address on the interface that reaches the router (a connected UDP socket sends nothing). */
function localAddressTowards(host: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createSocket("udp4");
    socket.on("error", reject);
    socket.connect(SSDP_PORT, host, () => {
      const { address } = socket.address();
      socket.close();
      resolve(address);
    });
  });
}

async function soap(service: WanService, action: string, args: Record<string, string | number>): Promise<string> {
  const params = Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join("");
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${service.type}">${params}</u:${action}></s:Body></s:Envelope>`;
  const res = await fetch(service.controlUrl, {
    method: "POST",
    headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: `"${service.type}#${action}"` },
    body,
    signal: AbortSignal.timeout(HTTP_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new UpnpError(Number(/<errorCode>\s*(\d+)/.exec(text)?.[1] ?? res.status));
  return text;
}

export interface PortMapping {
  /** What friends type: the public IP, with the port when it is not the default. */
  address: string;
  /** Removes the mapping; never rejects. */
  close(): Promise<void>;
}

export interface OpenPortOptions {
  /** The router's description URL, skipping the SSDP search (tests). */
  location?: string;
  searchMs?: number;
  /** Where the search goes; the SSDP multicast group by default (tests point it elsewhere). */
  searchTarget?: string;
}

/** Forwards TCP `port` on the router to the same port on this PC; rejects with a message for the player. */
export async function openPort(port: number, options: OpenPortOptions = {}): Promise<PortMapping> {
  const location = options.location ?? (await searchRouter(options.searchMs ?? SEARCH_MS, options.searchTarget));
  let service: WanService | undefined;
  try {
    const res = await fetch(location, { signal: AbortSignal.timeout(HTTP_MS) });
    service = findService(await res.text(), location);
  } catch (cause) {
    throw new Error(NO_ROUTER, { cause });
  }
  if (!service) throw new Error(NO_SERVICE);
  const wan = service;

  const ip = /<NewExternalIPAddress>\s*([^<\s]*)/.exec(await soap(wan, "GetExternalIPAddress", {}))?.[1] ?? "";
  if (!isPublicIpv4(ip)) throw new Error(CGNAT);

  const client = await localAddressTowards(new URL(location).hostname);
  const map = (lease: number) =>
    soap(wan, "AddPortMapping", { NewRemoteHost: "", NewExternalPort: port, NewProtocol: "TCP", NewInternalPort: port, NewInternalClient: client, NewEnabled: 1, NewPortMappingDescription: "SoulSilver", NewLeaseDuration: lease });
  let lease = LEASE_S;
  try {
    await map(lease);
  } catch (error) {
    const code = error instanceof UpnpError ? error.code : 0;
    if (code === 718) throw new Error(TAKEN, { cause: error });
    if (code !== 725) throw error;
    // 725 OnlyPermanentLeasesSupported: this mapping lasts until close() (or the router restarts).
    lease = 0;
    await map(lease);
  }
  const renew = lease > 0 ? setInterval(() => void map(lease).catch(() => {}), (lease * 1000) / 2) : undefined;
  renew?.unref();

  return {
    address: port === LAN_PORT_GAME ? ip : `${ip}:${port}`,
    async close() {
      clearInterval(renew);
      await soap(wan, "DeletePortMapping", { NewRemoteHost: "", NewExternalPort: port, NewProtocol: "TCP" }).catch(() => {});
    },
  };
}
