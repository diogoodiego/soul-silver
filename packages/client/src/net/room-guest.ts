import { LOBBY_PROTOCOL, readRoomCode, type RoomInfo, type TurnStatus } from "@soulsilver/shared/lobby";
import { lookupRoom, openLobbySocket, roomError, type LobbySocket, type RoomError, type SocketFactory } from "./lobby";
import { t } from "../i18n";
import { asJson, browserPeers, channelOpen, linkSignals, rtcConfig, type PeerFactory, type RtcLink } from "./rtc";

// O.5: a guest entering a room by code. It checks the room first (gone, other version, password), joins
// through the room server, answers the host's offer and resolves with the open data channel; then it
// leaves the room server, which the session no longer needs.

export const GUEST_OPEN_MS = 30_000;

export interface RoomJoinOptions {
  lobbyUrl: string;
  /** As typed: any case, with or without the dash. */
  code: string;
  playerName: string;
  appVersion: string;
  protocolVersion: number;
  sockets?: SocketFactory;
  peers?: PeerFactory;
  fetcher?: typeof fetch;
  openMs?: number;
}

export interface RoomJoined {
  channel: RTCDataChannel;
  room: RoomInfo;
  turn: TurnStatus;
  /** Closes the WebRTC connection. */
  close: () => void;
}

export interface RoomJoin {
  /** The room's data, before the connection is made (to ask for a password, say). */
  room: RoomInfo;
  /** Resolves with the open channel. */
  connect(): Promise<RoomJoined>;
  cancel(): void;
}

/** Checks the code and the room; throws RoomError with what to tell the player. */
export async function findRoom(options: RoomJoinOptions): Promise<RoomJoin> {
  const code = readRoomCode(options.code);
  if (!code) throw roomError("invalid-code");
  const room = await lookupRoom(options.lobbyUrl, code, options.fetcher);
  if (room.protocolVersion !== options.protocolVersion) throw roomError("wrong-version");
  if (room.players >= room.maxPlayers) throw roomError("room-full");

  let socket: LobbySocket | undefined;
  let link: RtcLink | undefined;
  let done = false;
  const cancel = () => {
    done = true;
    socket?.close();
    link?.close();
  };

  const connect = () =>
    new Promise<RoomJoined>((resolve, reject) => {
      const failWith = (e: RoomError) => {
        if (done) return;
        cancel();
        reject(e);
      };
      socket = openLobbySocket(
        options.lobbyUrl,
        `join/${code}`,
        {
          onOpen: () =>
            socket?.send({
              type: "join",
              lobbyProtocol: LOBBY_PROTOCOL,
              code,
              playerName: options.playerName,
              appVersion: options.appVersion,
              protocolVersion: options.protocolVersion,
            }),
          onMessage: (m) => {
            if (m.type === "error") return failWith(roomError(m.code === "malformed" ? "connect-failed" : m.code, m.message));
            if (m.type === "room-closed") return failWith(roomError("not-found"));
            if (m.type === "signal") return void link?.receive(m.data);
            if (m.type !== "joined") return;
            const pc = (options.peers ?? browserPeers)(rtcConfig(m.iceServers));
            link = linkSignals(pc, (data) => socket?.send({ type: "signal", data: asJson(data) }));
            const channel = new Promise<RTCDataChannel>((ok) => {
              pc.ondatachannel = (e) => ok(e.channel);
            });
            const turn = m.turn;
            channelOpen(channel, options.openMs ?? GUEST_OPEN_MS, () => roomError("connect-failed"))
              .then((open) => {
                if (done) return;
                // The channel is the session's now; the room server is not needed any more.
                socket?.close();
                socket = undefined;
                done = true;
                const current = link;
                resolve({ channel: open, room: m.room, turn, close: () => current?.close() });
              })
              .catch((e: RoomError) => failWith(e));
          },
          // Closed before the channel opened. Never opened: the room server refused (the room just closed) or is
          // out of reach; asking for the room again tells which.
          onClose: (opened) => {
            if (opened) return failWith(roomError("connect-failed"));
            lookupRoom(options.lobbyUrl, code, options.fetcher).then(
              () => failWith(roomError("connect-failed")),
              (e: RoomError) => failWith(e),
            );
          },
        },
        options.sockets,
      );
    });

  return { room, connect, cancel };
}

export interface EnterRoomDeps<Result> {
  find: () => Promise<RoomJoin>;
  /** The room password typed on the join screen; the host's game server checks it. */
  password: string;
  handOver: (joined: RoomJoined) => void;
  joinSession: (password: string) => Promise<Result>;
}

/** Find, ask for the password if the room has one, connect, hand over, join: what the join screen runs. */
export async function enterRoom<Result>(deps: EnterRoomDeps<Result>): Promise<Result | { ok: false; reason: string }> {
  let joined: RoomJoined;
  try {
    const found = await deps.find();
    if (found.room.hasPassword && deps.password === "") {
      found.cancel();
      return { ok: false, reason: t("rooms.needPassword") };
    }
    joined = await found.connect();
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  deps.handOver(joined);
  return deps.joinSession(deps.password);
}
