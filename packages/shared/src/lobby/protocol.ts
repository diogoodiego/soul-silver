import { z } from "zod";
import { isRoomCode } from "./code.ts";

// O.1: the room server's own protocol. It carries room data and WebRTC connection messages only, never game data.

export const LOBBY_PROTOCOL = 1;

/** Limits the server enforces; the app uses them to stay inside. */
export const LOBBY_LIMITS = {
  maxMessageBytes: 16 * 1024,
  signalsPerSecond: 20,
  roomsPerIp: 3,
  roomsPerIpWindowMs: 10 * 60 * 1000,
  heartbeatMs: 15_000,
  heartbeatTimeoutMs: 45_000,
  idleRoomMs: 60 * 60 * 1000,
  listMax: 50,
} as const;

const name = z.string().trim().min(1).max(40);
const version = z.string().min(1).max(32);
const protocolVersion = z.number().int().nonnegative();
const roomCode = z.string().refine(isRoomCode);

export const lobbyClientMessage = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("create"),
    lobbyProtocol: z.literal(LOBBY_PROTOCOL),
    roomName: name,
    hostName: name,
    appVersion: version,
    protocolVersion,
    maxPlayers: z.number().int().min(2).max(4),
    public: z.boolean(),
    hasPassword: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("join"),
    lobbyProtocol: z.literal(LOBBY_PROTOCOL),
    code: roomCode,
    playerName: name,
    appVersion: version,
    protocolVersion,
  }),
  // O.4: a host whose socket to the room server dropped takes its room back.
  z.strictObject({ type: z.literal("resume"), lobbyProtocol: z.literal(LOBBY_PROTOCOL), code: roomCode, hostToken: z.string().min(1).max(64) }),
  z.strictObject({ type: z.literal("update"), players: z.number().int().min(1).max(4) }),
  z.strictObject({ type: z.literal("heartbeat") }),
  z.strictObject({ type: z.literal("close") }),
  // The host names the guest it answers; a guest's signal always goes to the host.
  z.strictObject({ type: z.literal("signal"), to: z.string().min(1).max(32).optional(), data: z.json() }),
]);
export type LobbyClientMessage = z.infer<typeof lobbyClientMessage>;

export interface RoomSummary {
  code: string;
  roomName: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  hasPassword: boolean;
}

export interface RoomInfo extends RoomSummary {
  appVersion: string;
  protocolVersion: number;
  public: boolean;
}

/** What RTCPeerConnection takes in `iceServers`. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * O.3: whether the ICE servers include TURN. `off`: the server has no TURN key (STUN only, by choice);
 * `unavailable`: Cloudflare did not answer, so this connection got STUN only and the app warns.
 */
export type TurnStatus = "ok" | "off" | "unavailable";

export type LobbyErrorCode =
  | "malformed"
  | "too-large"
  | "rate-limited"
  | "not-found"
  | "room-full"
  | "not-allowed"
  | "too-many-rooms"
  | "wrong-version";

export type LobbyServerMessage =
  | { type: "created"; code: string; hostToken: string; room: RoomInfo; iceServers: IceServer[]; turn: TurnStatus }
  | { type: "joined"; guestId: string; guestToken: string; room: RoomInfo; iceServers: IceServer[]; turn: TurnStatus }
  | { type: "resumed"; room: RoomInfo; iceServers: IceServer[]; turn: TurnStatus }
  | { type: "guest-joined"; guestId: string; playerName: string }
  | { type: "guest-left"; guestId: string }
  | { type: "signal"; from: string; data: unknown }
  | { type: "room-closed"; reason: "closed" | "expired" | "idle" }
  | { type: "error"; code: LobbyErrorCode; message: string };

/** Undefined for anything that is not one whole, valid message. */
export function parseLobbyClientMessage(text: string): LobbyClientMessage | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = lobbyClientMessage.safeParse(json);
  return parsed.success ? parsed.data : undefined;
}
