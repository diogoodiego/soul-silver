import { exports } from "cloudflare:workers";
import { LOBBY_PROTOCOL, type LobbyServerMessage } from "@soulsilver/shared/lobby";

export const BASE = "https://lobby.test";

export function request(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(BASE + path, init));
}

export interface Client {
  ws: WebSocket;
  send(message: unknown): void;
  sendRaw(text: string): void;
  /** The next message the server sends, in order. */
  next(): Promise<LobbyServerMessage>;
  /** Resolves with the close code once the server closes the socket. */
  closed: Promise<number>;
}

/** Opens a WebSocket to the worker; `ip` stands in for the address Cloudflare reports. */
export async function connect(path: string, ip = "203.0.113.1"): Promise<Client> {
  const res = await request(path, { headers: { Upgrade: "websocket", "CF-Connecting-IP": ip } });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no websocket: ${res.status} ${await res.text()}`);
  ws.accept();
  const queue: LobbyServerMessage[] = [];
  const waiting: ((m: LobbyServerMessage) => void)[] = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data as string) as LobbyServerMessage;
    const w = waiting.shift();
    if (w) w(m);
    else queue.push(m);
  });
  const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e) => resolve(e.code)));
  return {
    ws,
    send: (m) => ws.send(JSON.stringify(m)),
    sendRaw: (t) => ws.send(t),
    next: () => {
      const m = queue.shift();
      if (m) return Promise.resolve(m);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no message within 2 s")), 2000);
        waiting.push((x) => {
          clearTimeout(timer);
          resolve(x);
        });
      });
    },
    closed,
  };
}

export const createMessage = (over: Record<string, unknown> = {}) => ({
  type: "create",
  lobbyProtocol: LOBBY_PROTOCOL,
  roomName: "Sala do Gold",
  hostName: "Gold",
  appVersion: "0.5.3",
  protocolVersion: 48,
  maxPlayers: 4,
  public: true,
  hasPassword: false,
  ...over,
});

export const joinMessage = (code: string, over: Record<string, unknown> = {}) => ({
  type: "join",
  lobbyProtocol: LOBBY_PROTOCOL,
  code,
  playerName: "Lyra",
  appVersion: "0.5.3",
  protocolVersion: 48,
  ...over,
});

export async function expectType<T extends LobbyServerMessage["type"]>(
  client: Client,
  type: T,
): Promise<Extract<LobbyServerMessage, { type: T }>> {
  const m = await client.next();
  if (m.type !== type) throw new Error(`expected ${type}, got ${JSON.stringify(m)}`);
  return m as Extract<LobbyServerMessage, { type: T }>;
}

/** A host with an open room. */
export async function hostRoom(over: Record<string, unknown> = {}, ip?: string) {
  const host = await connect("/host", ip);
  host.send(createMessage(over));
  const created = await expectType(host, "created");
  return { host, code: created.code, created };
}

/** A guest that joined `code`, and the host's notice of it. */
export async function joinRoom(host: Client, code: string, name = "Lyra") {
  const guest = await connect(`/join/${code}`);
  guest.send(joinMessage(code, { playerName: name }));
  const joined = await expectType(guest, "joined");
  const notice = await expectType(host, "guest-joined");
  return { guest, joined, notice };
}
