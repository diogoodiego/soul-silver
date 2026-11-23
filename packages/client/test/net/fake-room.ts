import type { LobbyClientMessage, LobbyServerMessage, RoomInfo } from "@soulsilver/shared/lobby";
import type { SocketFactory } from "../../src/net/lobby";
import type { PeerFactory } from "../../src/net/rtc";

// O.4–O.6: a room server and a WebRTC in memory (vitest has neither), close enough to the real ones for the
// app's room code: sockets that open asynchronously, signals relayed by guest id, data channels that open
// once offer and answer meet.

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  role: { kind: "host"; code?: string; ready: boolean } | { kind: "guest"; code: string; guestId?: string } | undefined;
  readonly url: string;
  private readonly server: FakeLobby;
  constructor(url: string, server: FakeLobby) {
    this.url = url;
    this.server = server;
  }
  send(text: string): void {
    this.server.receive(this, JSON.parse(text) as LobbyClientMessage);
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.server.closed(this);
    this.onclose?.();
  }
  deliver(m: LobbyServerMessage): void {
    if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(m) });
  }
  /** The server side goes away (network drop). */
  drop(): void {
    this.close();
  }
}

interface FakeRoom {
  info: RoomInfo;
  hostToken: string;
  host?: FakeSocket;
  guests: Map<string, FakeSocket>;
  next: number;
}

export const ICE = [{ urls: "stun:stun.cloudflare.com:3478" }, { urls: ["turn:turn.cloudflare.com:3478?transport=udp"], username: "u", credential: "c" }];

export class FakeLobby {
  up = true;
  rooms = new Map<string, FakeRoom>();
  sockets: FakeSocket[] = [];
  /** Every message the app sent, in order. */
  received: { from: FakeSocket; m: LobbyClientMessage }[] = [];
  codes = ["K7P2QX", "AB3CD4", "ZX9YW8"];
  turn: "ok" | "off" | "unavailable" = "ok";

  readonly sockets_: SocketFactory = (url) => {
    const s = new FakeSocket(url, this);
    this.sockets.push(s);
    void tick().then(() => {
      const path = new URL(url).pathname;
      const join = /^\/join\/(\w+)$/u.exec(path);
      const resume = /^\/host\/(\w+)$/u.exec(path);
      const refuse = !this.up || (join && !this.rooms.has(join[1]!)) || (resume && !this.rooms.has(resume[1]!));
      if (refuse) {
        s.readyState = 3;
        s.onclose?.();
        return;
      }
      s.role = join ? { kind: "guest", code: join[1]! } : { kind: "host", ...(resume ? { code: resume[1]! } : {}), ready: false };
      s.readyState = 1;
      s.onopen?.();
    });
    return s as unknown as WebSocket;
  };

  readonly fetch = (async (input: RequestInfo | URL) => {
    await tick();
    if (!this.up) throw new TypeError("fetch failed");
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const one = /^\/rooms\/(\w+)$/u.exec(url.pathname);
    if (one) {
      const room = this.rooms.get(one[1]!);
      return room ? Response.json({ room: room.info }) : Response.json({ code: "not-found" }, { status: 404 });
    }
    const protocol = Number(url.searchParams.get("protocol"));
    const rooms = [...this.rooms.values()].filter((r) => r.info.public && r.info.protocolVersion === protocol).map((r) => r.info);
    return Response.json({ rooms });
  }) as typeof fetch;

  /** A room someone else hosts, for the guest tests; its host socket answers like a host app would. */
  addRoom(info: Partial<RoomInfo> & { code: string }): FakeRoom {
    const room: FakeRoom = {
      info: { roomName: "Sala do Gold", hostName: "Gold", players: 1, maxPlayers: 4, hasPassword: false, appVersion: "0.5.3", protocolVersion: 49, public: true, ...info },
      hostToken: "token",
      guests: new Map(),
      next: 1,
    };
    this.rooms.set(info.code, room);
    return room;
  }

  receive(from: FakeSocket, m: LobbyClientMessage): void {
    this.received.push({ from, m });
    const role = from.role;
    if (!role) return;
    if (role.kind === "host") {
      if (m.type === "create") {
        const code = this.codes.shift()!;
        const room: FakeRoom = {
          info: { code, roomName: m.roomName, hostName: m.hostName, players: 1, maxPlayers: m.maxPlayers, hasPassword: m.hasPassword, appVersion: m.appVersion, protocolVersion: m.protocolVersion, public: m.public },
          hostToken: `token-${code}`,
          host: from,
          guests: new Map(),
          next: 1,
        };
        this.rooms.set(code, room);
        role.code = code;
        role.ready = true;
        from.deliver({ type: "created", code, hostToken: room.hostToken, room: room.info, iceServers: ICE, turn: this.turn });
        return;
      }
      const room = role.code ? this.rooms.get(role.code) : undefined;
      if (!room) return;
      if (m.type === "resume") {
        if (m.hostToken !== room.hostToken) return from.deliver({ type: "error", code: "not-allowed", message: "token" });
        room.host = from;
        role.ready = true;
        from.deliver({ type: "resumed", room: room.info, iceServers: ICE, turn: this.turn });
        return;
      }
      if (m.type === "update") room.info.players = m.players;
      if (m.type === "close") this.closeRoom(room.info.code, "closed");
      if (m.type === "signal" && m.to) room.guests.get(m.to)?.deliver({ type: "signal", from: "host", data: m.data });
      return;
    }
    const room = this.rooms.get(role.code);
    if (!room) return;
    if (m.type === "join") {
      if (m.protocolVersion !== room.info.protocolVersion) return from.deliver({ type: "error", code: "wrong-version", message: "v" });
      if (room.guests.size + 1 >= room.info.maxPlayers || room.info.players >= room.info.maxPlayers) return from.deliver({ type: "error", code: "room-full", message: "full" });
      const guestId = `g${room.next++}`;
      role.guestId = guestId;
      room.guests.set(guestId, from);
      from.deliver({ type: "joined", guestId, guestToken: `gt-${guestId}`, room: room.info, iceServers: ICE, turn: this.turn });
      room.host?.deliver({ type: "guest-joined", guestId, playerName: m.playerName });
      return;
    }
    if (m.type === "signal" && role.guestId) room.host?.deliver({ type: "signal", from: role.guestId, data: m.data });
  }

  closed(s: FakeSocket): void {
    const role = s.role;
    if (role?.kind !== "guest" || !role.guestId) return;
    const room = this.rooms.get(role.code);
    if (!room?.guests.delete(role.guestId)) return;
    room.host?.deliver({ type: "guest-left", guestId: role.guestId });
  }

  closeRoom(code: string, reason: "closed" | "expired" | "idle"): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    for (const s of [room.host, ...room.guests.values()]) {
      s?.deliver({ type: "room-closed", reason });
    }
  }

  sent(type: LobbyClientMessage["type"]) {
    return this.received.filter((r) => r.m.type === type).map((r) => r.m);
  }
}

// --- WebRTC ---

export class FakeChannel {
  readyState: RTCDataChannelState = "connecting";
  peer: FakeChannel | undefined;
  sent: string[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  private listeners: (() => void)[] = [];
  addEventListener(type: string, fn: () => void): void {
    if (type === "open") this.listeners.push(fn);
  }
  open(): void {
    this.readyState = "open";
    for (const fn of this.listeners.splice(0)) fn();
  }
  send(data: string): void {
    this.sent.push(data);
    this.peer?.onmessage?.({ data });
  }
  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.();
    this.peer?.close();
  }
}

export class FakeRtc {
  pcs: FakePc[] = [];
  /** When false, offers and answers never meet (a network that blocks the link). */
  connects = true;
  readonly factory: PeerFactory = (config) => {
    const pc = new FakePc(this, config);
    this.pcs.push(pc);
    return pc as unknown as RTCPeerConnection;
  };
}

let ids = 0;

export class FakePc {
  readonly id = ++ids;
  localDescription: { type: RTCSdpType; sdp: string } | null = null;
  remoteDescription: { type: RTCSdpType; sdp: string } | null = null;
  channel: FakeChannel | undefined;
  candidates: unknown[] = [];
  closed = false;
  onicecandidate: ((e: { candidate: { toJSON(): unknown } | null }) => void) | null = null;
  ondatachannel: ((e: { channel: FakeChannel }) => void) | null = null;
  private readonly rtc: FakeRtc;
  readonly config: RTCConfiguration;
  constructor(rtc: FakeRtc, config: RTCConfiguration) {
    this.rtc = rtc;
    this.config = config;
  }
  createDataChannel(): FakeChannel {
    this.channel = new FakeChannel();
    return this.channel;
  }
  createOffer() {
    return Promise.resolve({ type: "offer" as const, sdp: `offer:${this.id}` });
  }
  createAnswer() {
    return Promise.resolve({ type: "answer" as const, sdp: `answer:${this.id}:${this.remoteDescription?.sdp ?? ""}` });
  }
  setLocalDescription(d: { type: RTCSdpType; sdp: string }) {
    this.localDescription = d;
    // Trickle: a candidate shows up a moment later.
    void tick().then(() => this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `cand:${this.id}`, sdpMid: "0" }) } }));
    return Promise.resolve();
  }
  setRemoteDescription(d: { type: RTCSdpType; sdp: string }) {
    this.remoteDescription = d;
    if (d.type === "answer" && this.rtc.connects) {
      const offerId = Number(/^answer:(\d+):/u.exec(d.sdp)?.[1]);
      const answerer = this.rtc.pcs.find((p) => p.id === offerId);
      if (answerer && this.channel) {
        const theirs = new FakeChannel();
        theirs.peer = this.channel;
        this.channel.peer = theirs;
        void tick().then(() => {
          this.channel?.open();
          answerer.ondatachannel?.({ channel: theirs });
          theirs.open();
        });
      }
    }
    return Promise.resolve();
  }
  addIceCandidate(c: unknown) {
    this.candidates.push(c);
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.channel?.close();
  }
}

/** Lets fake sockets, timers at 0 and promise chains run. */
export async function settle(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await tick();
}

/** A MessageChannel's port stand-in, as the game server's end of a guest link. */
export function fakePort() {
  const posted: unknown[] = [];
  const port = {
    onmessage: null as ((e: { data: unknown }) => void) | null,
    postMessage: (d: unknown) => posted.push(d),
    close: () => undefined,
  };
  return { port: port as unknown as MessagePort, posted };
}
