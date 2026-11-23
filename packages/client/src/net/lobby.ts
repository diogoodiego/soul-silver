import {
  lobbySocketUrl,
  type LobbyClientMessage,
  type LobbyErrorCode,
  type LobbyServerMessage,
  type RoomInfo,
  type RoomSummary,
} from "@soulsilver/shared/lobby";
import { t } from "../i18n";

// O.4/O.5: talking to the room server: its list over HTTP, and one WebSocket per room connection.

export type SocketFactory = (url: string) => WebSocket;
/** WebSocket.OPEN, without needing the global in tests. */
const OPEN = 1;
const browserSockets: SocketFactory = (url) => new WebSocket(url);

/** Why a room action failed; `unreachable` is the room server not answering at all. */
export type RoomFailure = LobbyErrorCode | "unreachable" | "invalid-code" | "connect-failed" | "closed";

export class RoomError extends Error {
  readonly reason: RoomFailure;
  constructor(reason: RoomFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

const MESSAGES: Partial<Record<RoomFailure, Parameters<typeof t>[0]>> = {
  unreachable: "rooms.unreachable",
  "not-found": "rooms.notFound",
  "room-full": "rooms.full",
  "wrong-version": "rooms.wrongVersion",
  "too-many-rooms": "room.tooMany",
  "invalid-code": "rooms.invalidCode",
  "connect-failed": "rooms.connectFailed",
  closed: "room.reconnectClosed",
};

export function roomError(reason: RoomFailure, detail?: string): RoomError {
  const key = MESSAGES[reason];
  return new RoomError(reason, key ? t(key) : t("rooms.failed", { detail: detail ?? reason }));
}

export interface LobbySocket {
  send(message: LobbyClientMessage): void;
  close(): void;
  readonly open: boolean;
}

export interface LobbyHandlers {
  onOpen?(): void;
  onMessage(message: LobbyServerMessage): void;
  /** `opened`: whether the socket ever opened; one that never did means the server is unreachable (or refused). */
  onClose(opened: boolean): void;
}

/** One WebSocket to the room server; messages are JSON in both directions. */
export function openLobbySocket(base: string, path: string, handlers: LobbyHandlers, sockets: SocketFactory = browserSockets): LobbySocket {
  let opened = false;
  let closed = false;
  let ws: WebSocket;
  try {
    ws = sockets(lobbySocketUrl(base, path));
  } catch {
    // A malformed address in the settings: the same as no server.
    queueMicrotask(() => handlers.onClose(false));
    return { send: () => undefined, close: () => undefined, open: false };
  }
  ws.onopen = () => {
    opened = true;
    handlers.onOpen?.();
  };
  ws.onmessage = (e: MessageEvent) => {
    if (typeof e.data !== "string") return;
    try {
      handlers.onMessage(JSON.parse(e.data) as LobbyServerMessage);
    } catch {
      // Not JSON: not from a room server of ours.
    }
  };
  ws.onclose = () => {
    if (closed) return;
    closed = true;
    handlers.onClose(opened);
  };
  return {
    send(message) {
      if (ws.readyState === OPEN) ws.send(JSON.stringify(message));
    },
    close() {
      closed = true;
      ws.onclose = null;
      ws.close(1000);
    },
    get open() {
      return ws.readyState === OPEN;
    },
  };
}

async function getJson(base: string, path: string, fetcher: typeof fetch): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetcher(new URL(path, base.endsWith("/") ? base : `${base}/`).toString());
  } catch {
    throw roomError("unreachable");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw roomError("unreachable");
  }
  return { status: res.status, body };
}

/** The public rooms on this game protocol version. */
export async function listRooms(base: string, protocolVersion: number, fetcher: typeof fetch = fetch): Promise<RoomSummary[]> {
  const { status, body } = await getJson(base, `rooms?protocol=${protocolVersion}`, fetcher);
  const rooms = (body as { rooms?: unknown }).rooms;
  if (status !== 200 || !Array.isArray(rooms)) throw roomError("unreachable");
  return rooms as RoomSummary[];
}

/** One room by code, public or not; RoomError `not-found` when it is not open. */
export async function lookupRoom(base: string, code: string, fetcher: typeof fetch = fetch): Promise<RoomInfo> {
  const { status, body } = await getJson(base, `rooms/${code}`, fetcher);
  if (status === 404) throw roomError("not-found");
  const room = (body as { room?: RoomInfo }).room;
  if (status !== 200 || !room) throw roomError("unreachable");
  return room;
}
