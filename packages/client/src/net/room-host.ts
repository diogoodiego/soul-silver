import { LOBBY_LIMITS, LOBBY_PROTOCOL, type IceServer, type LobbyServerMessage, type TurnStatus } from "@soulsilver/shared/lobby";
import { t } from "../i18n";
import { listRooms, openLobbySocket, type LobbySocket, type SocketFactory } from "./lobby";
import { bridge } from "./peer";
import { asJson, browserPeers, channelOpen, linkSignals, rtcConfig, type PeerFactory, type RtcLink } from "./rtc";

// O.4: the host's online room. The room server introduces each guest; this side opens one WebRTC connection
// per guest with the ICE servers the room server handed out, and hands each open data channel to the game
// server the way an R.3 invite does. Guests already playing never depend on the room server again.

/** At most this many guests at once (a session is 4 players). */
export const MAX_GUESTS = 3;

export interface RoomHostTiming {
  heartbeatMs: number;
  /** How long a guest's channel may take to open. */
  openMs: number;
  /** How long the first connection to the room server may take. */
  connectMs: number;
  /** Waits between attempts to get back to the room server: 1st, 2nd, then the last one repeated. */
  retryMs: readonly number[];
  /** After this long away the room server dropped the room; the next attempt creates a new one. */
  roomLostMs: number;
}

export const ROOM_HOST_TIMING: RoomHostTiming = {
  heartbeatMs: LOBBY_LIMITS.heartbeatMs,
  openMs: 30_000,
  connectMs: 10_000,
  retryMs: [2_000, 5_000, 10_000],
  roomLostMs: LOBBY_LIMITS.heartbeatTimeoutMs,
};

export interface RoomHostGuest {
  id: string;
  name: string;
  state: "connecting" | "connected" | "failed";
}

export interface RoomHostState {
  status: "connecting" | "open" | "reconnecting" | "closed" | "error";
  code?: string;
  turn?: TurnStatus;
  guests: RoomHostGuest[];
  /** What to tell the player; set with `error`, and for a new code after the old room was lost. */
  message?: string | undefined;
}

export interface RoomHostOptions {
  lobbyUrl: string;
  roomName: string;
  hostName: string;
  appVersion: string;
  protocolVersion: number;
  public: boolean;
  hasPassword: boolean;
  /** A port to the game server for one guest (hostLink in peer-link.ts). */
  openLink: () => Promise<MessagePort>;
  onChange: (state: RoomHostState) => void;
  sockets?: SocketFactory;
  peers?: PeerFactory;
  /** Whether the room server answers HTTP; tells "refused" from "out of reach". */
  probe?: () => Promise<boolean>;
  timing?: Partial<RoomHostTiming>;
}

export interface RoomHost {
  /** The players in the session now, host included; the public list shows it. */
  setPlayers(n: number): void;
  /** Ends the room; guests already playing stay connected. */
  close(): void;
  readonly state: RoomHostState;
}

interface PendingGuest {
  link: RtcLink;
  name: string;
  timer: ReturnType<typeof setTimeout>;
}

export function hostRoom(options: RoomHostOptions): RoomHost {
  const timing = { ...ROOM_HOST_TIMING, ...options.timing };
  const peers = options.peers ?? browserPeers;
  let state: RoomHostState = { status: "connecting", guests: [] };
  let socket: LobbySocket | undefined;
  let hostToken: string | undefined;
  let iceServers: IceServer[] = [];
  let players = 1;
  let closing = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  /** When the socket to the room server dropped; undefined while connected. */
  let lostAt: number | undefined;
  const pending = new Map<string, PendingGuest>();
  let connected = 0;

  const set = (patch: Partial<RoomHostState>) => {
    state = { ...state, ...patch };
    options.onChange(state);
  };
  const setGuest = (id: string, name: string, guestState: RoomHostGuest["state"]) => {
    const others = state.guests.filter((g) => g.id !== id);
    set({ guests: [...others, { id, name, state: guestState }] });
  };
  const dropGuest = (id: string) => set({ guests: state.guests.filter((g) => g.id !== id) });

  function stopHeartbeat(): void {
    if (heartbeat !== undefined) clearInterval(heartbeat);
    heartbeat = undefined;
  }

  function opened(code: string, servers: IceServer[], turn: TurnStatus): void {
    clearTimeout(connectTimer);
    const newCode = state.code !== undefined && state.code !== code;
    iceServers = servers;
    attempts = 0;
    lostAt = undefined;
    set({ status: "open", code, turn, ...(newCode ? { message: t("room.newCode", { code }) } : { message: undefined }) });
    socket?.send({ type: "update", players });
    stopHeartbeat();
    heartbeat = setInterval(() => socket?.send({ type: "heartbeat" }), timing.heartbeatMs);
  }

  function startGuest(guestId: string, name: string): void {
    if (pending.size + connected >= MAX_GUESTS || pending.has(guestId)) return;
    const pc = peers(rtcConfig(iceServers));
    const link = linkSignals(pc, (data) => socket?.send({ type: "signal", to: guestId, data: asJson(data) }));
    const channel = pc.createDataChannel("game", { ordered: true });
    const fail = () => {
      if (!pending.has(guestId)) return;
      pending.delete(guestId);
      link.close();
      setGuest(guestId, name, "failed");
    };
    const timer = setTimeout(fail, timing.openMs);
    pending.set(guestId, { link, name, timer });
    setGuest(guestId, name, "connecting");
    void (async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        const d = pc.localDescription;
        if (d) socket?.send({ type: "signal", to: guestId, data: asJson({ sdp: { type: d.type, sdp: d.sdp } }) });
        const open = await channelOpen(Promise.resolve(channel), timing.openMs, () => new Error("timeout"));
        const port = await options.openLink();
        if (!pending.has(guestId)) return;
        clearTimeout(timer);
        pending.delete(guestId);
        connected++;
        setGuest(guestId, name, "connected");
        bridge(open, port, () => {
          connected--;
          pc.close();
          dropGuest(guestId);
        });
      } catch {
        fail();
      }
    })();
  }

  function onMessage(m: LobbyServerMessage): void {
    switch (m.type) {
      case "created":
        hostToken = m.hostToken;
        opened(m.code, m.iceServers, m.turn);
        return;
      case "resumed":
        opened(m.room.code, m.iceServers, m.turn);
        return;
      case "guest-joined":
        startGuest(m.guestId, m.playerName);
        return;
      case "guest-left": {
        // A guest leaves the room server once its channel is open; only a half-made connection goes with it.
        const p = pending.get(m.guestId);
        if (!p) return;
        clearTimeout(p.timer);
        pending.delete(m.guestId);
        p.link.close();
        dropGuest(m.guestId);
        return;
      }
      case "signal":
        void pending.get(m.from)?.link.receive(m.data);
        return;
      case "room-closed":
        // The room server ended the room (expired while away): the next attempt makes a new one.
        hostToken = undefined;
        return;
      case "error":
        // A refused resume: the room is gone or not ours any more; the next attempt makes a new one.
        if (m.code === "not-allowed") hostToken = undefined;
        if (m.code === "too-many-rooms") {
          closing = true;
          set({ status: "error", message: t("room.tooMany") });
        }
        return;
    }
  }

  function connect(): void {
    const resume = hostToken !== undefined && state.code !== undefined && (lostAt === undefined || Date.now() - lostAt < timing.roomLostMs);
    if (!resume) hostToken = undefined;
    const code = state.code;
    socket = openLobbySocket(
      options.lobbyUrl,
      resume && code ? `host/${code}` : "host",
      {
        onOpen: () => {
          if (resume && code && hostToken) socket?.send({ type: "resume", lobbyProtocol: LOBBY_PROTOCOL, code, hostToken });
          else
            socket?.send({
              type: "create",
              lobbyProtocol: LOBBY_PROTOCOL,
              roomName: options.roomName,
              hostName: options.hostName,
              appVersion: options.appVersion,
              protocolVersion: options.protocolVersion,
              maxPlayers: 4,
              public: options.public,
              hasPassword: options.hasPassword,
            });
        },
        onMessage,
        onClose: (wasOpen) => onLost(wasOpen),
      },
      options.sockets,
    );
  }

  function onLost(wasOpen: boolean): void {
    stopHeartbeat();
    clearTimeout(connectTimer);
    socket = undefined;
    if (closing) return;
    if (state.status === "connecting" && !wasOpen && state.code === undefined) {
      // Never got in. If the server answers HTTP, it refused this room (too many from this address);
      // otherwise it is out of reach. Either way the LAN session is untouched.
      closing = true;
      clearTimeout(connectTimer);
      void (options.probe ?? (() => listRooms(options.lobbyUrl, options.protocolVersion).then(() => true, () => false)))().then((up) =>
        set({ status: "error", message: t(up ? "room.tooMany" : "room.unreachable") }),
      );
      return;
    }
    lostAt ??= Date.now();
    set({ status: "reconnecting", message: t("room.reconnecting") });
    const wait = timing.retryMs[Math.min(attempts, timing.retryMs.length - 1)]!;
    attempts++;
    retry = setTimeout(connect, wait);
  }

  const connectTimer = setTimeout(() => {
    if (state.status !== "connecting") return;
    closing = true;
    socket?.close();
    set({ status: "error", message: t("room.unreachable") });
  }, timing.connectMs);
  connect();

  return {
    setPlayers(n) {
      players = n;
      if (state.status === "open") socket?.send({ type: "update", players: n });
    },
    close() {
      if (closing && state.status === "closed") return;
      closing = true;
      stopHeartbeat();
      clearTimeout(retry);
      clearTimeout(connectTimer);
      socket?.send({ type: "close" });
      socket?.close();
      socket = undefined;
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.link.close();
      }
      pending.clear();
      set({ status: "closed", guests: state.guests.filter((g) => g.state === "connected"), message: undefined });
    },
    get state() {
      return state;
    },
  };
}
