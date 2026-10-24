import { LAN_PORT_GAME } from "@soulsilver/shared/lan";
import { WebSocket } from "ws";
import { rawText } from "../server-host/ws-listener";

// The guest's link to a host on the LAN (spec 012). The renderer cannot open sockets (principle IX),
// so the main process holds it and relays the game protocol.

const CONNECT_TIMEOUT_MS = 5000;

/** Accepts `host` or `host:port` (IPv4 or a name). */
export function parseAddress(text: string): { host: string; port: number } | undefined {
  const match = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(text.trim());
  if (!match) return undefined;
  const port = match[2] ? Number(match[2]) : LAN_PORT_GAME;
  return port >= 1 && port <= 65535 ? { host: match[1]!, port } : undefined;
}

export interface RemoteClientOptions {
  onMessage(msg: unknown): void;
  /** The socket closed, by either side. */
  onClose(): void;
  log(message: string): void;
}

export function createRemoteClient(options: RemoteClientOptions) {
  let socket: WebSocket | undefined;
  /** Reconnect tokens per host and player name, kept in memory only. */
  const tokens = new Map<string, string>();
  let key = "";

  const close = () => {
    const old = socket;
    socket = undefined;
    old?.removeAllListeners();
    old?.on("error", () => {});
    old?.terminate();
  };

  return {
    /** Resolves when the socket is open; rejects with a message for the player. */
    connect(address: string): Promise<void> {
      close();
      const parsed = parseAddress(address);
      if (!parsed) return Promise.reject(new Error("Endereço inválido. Use o formato 192.168.0.10 ou 192.168.0.10:47800."));
      key = `${parsed.host}:${parsed.port}`;
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${parsed.host}:${parsed.port}`, { handshakeTimeout: CONNECT_TIMEOUT_MS });
        socket = ws;
        let opened = false;
        ws.once("open", () => {
          opened = true;
          resolve();
        });
        ws.on("message", (data, isBinary) => {
          if (isBinary) return;
          try {
            const msg = JSON.parse(rawText(data)) as unknown;
            if (typeof msg === "object" && msg !== null && (msg as { type?: unknown }).type === "welcome") {
              const { resumeToken } = msg as { resumeToken?: unknown };
              const name = playerName.get(ws);
              if (typeof resumeToken === "string" && name) tokens.set(`${key}|${name}`, resumeToken);
            }
            options.onMessage(msg);
          } catch {
            options.log("Discarded a host frame that is not JSON");
          }
        });
        ws.on("error", (error) => {
          options.log(`Host connection: ${error.message}`);
          if (!opened) reject(new Error(`Não foi possível conectar a ${key}: ${friendly(error)}`));
        });
        ws.on("close", () => {
          if (socket === ws) socket = undefined;
          if (opened) options.onClose();
          else reject(new Error(`Não foi possível conectar a ${key}.`));
        });
      });
    },
    /** A hello gets the stored reconnect token for this host and player, if any. */
    send(msg: unknown): void {
      const ws = socket;
      if (!ws || ws.readyState !== ws.OPEN) return;
      let out = msg;
      if (isHello(msg)) {
        const name = msg.save.name.trim().toLocaleLowerCase("en");
        playerName.set(ws, name);
        const token = tokens.get(`${key}|${name}`);
        if (token) out = { ...msg, resumeToken: token };
      }
      ws.send(JSON.stringify(out));
    },
    close,
    get connected() {
      return socket !== undefined && socket.readyState === socket.OPEN;
    },
  };
}

const playerName = new WeakMap<WebSocket, string>();

function isHello(msg: unknown): msg is { type: "hello"; save: { name: string } } {
  const m = msg as { type?: unknown; save?: { name?: unknown } } | null;
  return typeof m === "object" && m !== null && m.type === "hello" && typeof m.save?.name === "string";
}

function friendly(error: Error): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ECONNREFUSED") return "ninguém está hospedando nesse endereço";
  if (code === "ENOTFOUND") return "endereço não encontrado";
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH") return "endereço inacessível";
  return error.message;
}

export type RemoteClient = ReturnType<typeof createRemoteClient>;
