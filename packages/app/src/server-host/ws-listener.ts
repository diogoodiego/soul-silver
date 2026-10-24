import { WebSocketServer, type RawData, type WebSocket } from "ws";

// The game server's LAN socket (spec 012, research R1). Other PCs connect here; each socket is a
// connId at or above REMOTE_CONN_BASE so it cannot clash with the local renderer's ids.

export const REMOTE_CONN_BASE = 1_000_000;
const MAX_FRAME_BYTES = 1_000_000;

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
}

export interface WsListener {
  /** Resolves with the bound port; rejects when no port could be bound. */
  start(): Promise<number>;
  stop(): void;
  send(connId: number, msg: unknown): void;
  close(connId: number): void;
}

export function createWsListener(options: WsListenerOptions): WsListener {
  const sockets = new Map<number, WebSocket>();
  let server: WebSocketServer | undefined;
  let nextId = REMOTE_CONN_BASE;

  function bind(port: number): Promise<WebSocketServer> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port, host: "0.0.0.0", maxPayload: MAX_FRAME_BYTES });
      wss.once("listening", () => resolve(wss));
      wss.once("error", reject);
    });
  }

  function accept(socket: WebSocket): void {
    const connId = nextId++;
    sockets.set(connId, socket);
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      try {
        options.onMessage(connId, JSON.parse(rawText(data)) as unknown);
      } catch {
        options.log(`Connection ${connId}: discarded a frame that is not JSON`);
      }
    });
    socket.on("close", () => {
      if (sockets.delete(connId)) options.onClose(connId);
    });
    socket.on("error", (error) => {
      options.log(`Connection ${connId}: ${error.message}`);
    });
  }

  return {
    async start() {
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
      for (const socket of sockets.values()) socket.terminate();
      server?.close();
      server = undefined;
    },
    send(connId, msg) {
      const socket = sockets.get(connId);
      if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    },
    close(connId) {
      const socket = sockets.get(connId);
      if (!socket) return;
      sockets.delete(connId);
      // Let the last frames (reject, session-closed) flush before the socket goes.
      socket.close();
    },
  };
}
