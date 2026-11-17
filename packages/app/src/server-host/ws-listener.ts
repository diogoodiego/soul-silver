import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { WebSocketServer, type RawData, type WebSocket } from "ws";

// The game server's LAN socket (spec 012, research R1). Other PCs connect here; each socket is a
// connId at or above REMOTE_CONN_BASE so it cannot clash with the local renderer's ids.

export const REMOTE_CONN_BASE = 1_000_000;
const MAX_FRAME_BYTES = 1_000_000;
/** R.1: wrong room passwords allowed per address within the window before it is turned away. */
const MAX_WRONG = 5;
const WRONG_WINDOW_MS = 60_000;

/** Hashing first makes both sides the same length, so the comparison takes the same time either way. */
const samePassword = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** A text frame's payload as a string. */
export function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return (Buffer.isBuffer(data) ? data : Buffer.from(data)).toString("utf8");
}

export interface WsListenerOptions {
  /** Tried in order until one binds. */
  ports: readonly number[];
  onMessage(connId: number, msg: unknown): void;
  onClose(connId: number): void;
  log(message: string): void;
  /** Milliseconds, for the wrong-password window; Date.now by default. */
  now?: () => number;
}

export interface WsListener {
  /**
   * Resolves with the bound port; rejects when no port could be bound. A non-empty `password` (R.1) must come in
   * the first message of each connection, a hello's `roomPassword`; calling it again while open only changes it.
   */
  start(password?: string): Promise<number>;
  stop(): void;
  send(connId: number, msg: unknown): void;
  close(connId: number): void;
  /** R.3: takes a connection that did not come through the socket (a WebRTC data channel); returns its connId. */
  adopt(link: Link): number;
}

/** One connection, whatever carries it: a WebSocket here, a WebRTC data channel from the renderer (R.3). */
export interface Link {
  /** Who is on the other end, for the wrong-password limit. */
  remote: string;
  send(text: string): void;
  /** Lets the last frames go, then closes. */
  close(): void;
  /** Closes at once; close() when absent. */
  terminate?(): void;
  onMessage(listener: (text: string) => void): void;
  onClose(listener: () => void): void;
}

function socketLink(socket: WebSocket, request: IncomingMessage): Link {
  return {
    remote: request.socket.remoteAddress ?? "?",
    send: (text) => {
      if (socket.readyState === socket.OPEN) socket.send(text);
    },
    close: () => socket.close(),
    terminate: () => socket.terminate(),
    onMessage: (listener) =>
      socket.on("message", (data, isBinary) => {
        if (!isBinary) listener(rawText(data));
      }),
    onClose: (listener) => socket.on("close", listener),
  };
}

/** The part of Electron's MessagePortMain a link uses. */
export interface LinkPort {
  postMessage(data: unknown): void;
  on(event: "message", listener: (e: { data: unknown }) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  start(): void;
  close(): void;
}

/**
 * R.3: a WebRTC data channel from the renderer, as a MessagePort. Text passes as it is; `null` means the other
 * side closed, since the renderer's port cannot see its other end go.
 */
export function portLink(port: LinkPort, remote: string): Link {
  const closeListeners: (() => void)[] = [];
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    port.close();
    for (const l of closeListeners) l();
  };
  port.on("close", end);
  return {
    remote,
    send: (text) => {
      if (!ended) port.postMessage(text);
    },
    close: () => {
      if (!ended) port.postMessage(null);
      end();
    },
    onMessage: (listener) => {
      port.on("message", (e) => {
        if (e.data === null) end();
        else if (typeof e.data === "string" && !ended) listener(e.data);
      });
      port.start();
    },
    onClose: (listener) => closeListeners.push(listener),
  };
}

export function createWsListener(options: WsListenerOptions): WsListener {
  const links = new Map<number, Link>();
  let server: WebSocketServer | undefined;
  let nextId = REMOTE_CONN_BASE;
  let password = "";
  const now = options.now ?? Date.now;
  /** Times of recent wrong passwords, by remote address. */
  const wrong = new Map<string, number[]>();

  /** Undefined when the first message may pass; otherwise why it is refused, counting the try. */
  function refusal(ip: string, msg: unknown): string | undefined {
    const recent = (wrong.get(ip) ?? []).filter((t) => now() - t < WRONG_WINDOW_MS);
    wrong.set(ip, recent);
    if (recent.length >= MAX_WRONG) return "Muitas tentativas com senha errada. Espere um minuto e tente de novo.";
    const given = (msg as { type?: unknown; roomPassword?: unknown } | null)?.type === "hello" ? (msg as { roomPassword?: unknown }).roomPassword : undefined;
    if (typeof given === "string" && samePassword(given, password)) {
      wrong.delete(ip);
      return undefined;
    }
    recent.push(now());
    return given === undefined ? "Esta sessão tem senha. Digite a senha da sala." : "Senha da sala incorreta.";
  }

  function bindOn(port: number, host: string): Promise<WebSocketServer> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port, host, maxPayload: MAX_FRAME_BYTES });
      wss.once("listening", () => resolve(wss));
      wss.once("error", reject);
    });
  }

  /** R.2: `::` takes IPv4 and IPv6 at once; a PC without IPv6 falls back to IPv4 only. */
  async function bind(port: number): Promise<WebSocketServer> {
    try {
      return await bindOn(port, "::");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") throw error;
      return bindOn(port, "0.0.0.0");
    }
  }

  function adopt(link: Link): number {
    const connId = nextId++;
    links.set(connId, link);
    let checked = password === "";
    link.onMessage((text) => {
      let msg: unknown;
      try {
        msg = JSON.parse(text) as unknown;
      } catch {
        options.log(`Connection ${connId}: discarded a frame that is not JSON`);
        return;
      }
      if (!checked) {
        const why = refusal(link.remote, msg);
        if (why) {
          options.log(`Connection ${connId} (${link.remote}): refused, room password`);
          // Forgotten before closing: the server never heard of this connection.
          links.delete(connId);
          link.send(JSON.stringify({ type: "reject", code: "wrong-password", message: why, serverProtocolVersion: PROTOCOL_VERSION }));
          link.close();
          return;
        }
        checked = true;
      }
      options.onMessage(connId, msg);
    });
    link.onClose(() => {
      if (links.delete(connId)) options.onClose(connId);
    });
    return connId;
  }

  function accept(socket: WebSocket, request: IncomingMessage): void {
    const connId = adopt(socketLink(socket, request));
    socket.on("error", (error) => {
      options.log(`Connection ${connId}: ${error.message}`);
    });
  }

  return {
    async start(roomPassword = "") {
      password = roomPassword;
      if (server) return (server.address() as { port: number }).port;
      let lastError: Error = new Error("nenhuma porta disponível");
      for (const port of options.ports) {
        try {
          const wss = await bind(port);
          wss.on("connection", accept);
          wss.on("error", (error) => {
            options.log(`LAN socket: ${error.message}`);
          });
          server = wss;
          return (wss.address() as { port: number }).port;
        } catch (error) {
          lastError = error as Error;
        }
      }
      throw lastError;
    },
    stop() {
      // The close events report each connection to the server.
      for (const link of [...links.values()]) (link.terminate ?? link.close)();
      server?.close();
      server = undefined;
    },
    send(connId, msg) {
      links.get(connId)?.send(JSON.stringify(msg));
    },
    close(connId) {
      const link = links.get(connId);
      if (!link) return;
      links.delete(connId);
      // Let the last frames (reject, session-closed) flush before the link goes.
      link.close();
    },
    adopt,
  };
}
