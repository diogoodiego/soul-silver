import { DurableObject } from "cloudflare:workers";
import {
  LOBBY_LIMITS,
  parseLobbyClientMessage,
  type LobbyClientMessage,
  type LobbyErrorCode,
  type LobbyServerMessage,
  type RoomInfo,
} from "@soulsilver/shared/lobby";
import { directory } from "./directory.ts";
import { iceServersFor } from "./turn.ts";

// O.1: one Durable Object per room, named by its code. It holds the room data and relays WebRTC connection
// messages between the host and each guest without reading them. Its storage is wiped when the room closes.

/** How long a host may stay connected without sending `create`. */
const CREATE_TIMEOUT_MS = 10_000;

interface Guest {
  name: string;
  token: string;
}

/** Kept on each socket, so it survives hibernation. */
/** `ready`: the host sent `create`, or `resume` with the right token. */
type Attachment = { role: "host"; ready: boolean } | { role: "guest"; guestId?: string };

interface RateWindow {
  start: number;
  count: number;
}

const encoder = new TextEncoder();

function send(ws: WebSocket, message: LobbyServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket already closed; its close handler does the rest.
  }
}

function fail(ws: WebSocket, code: LobbyErrorCode, message: string): void {
  send(ws, { type: "error", code, message });
}

function closeSocket(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

export class Room extends DurableObject<Cloudflare.Env> {
  /** Signal counts per socket; lost on hibernation, which only resets a one-second window. */
  private readonly rates = new Map<WebSocket, RateWindow>();

  override async fetch(request: Request): Promise<Response> {
    const role = request.headers.get("X-Lobby-Role");
    const code = request.headers.get("X-Lobby-Code") ?? "";
    const status = await this.ctx.storage.get<string>("status");
    if (role === "host") {
      // The code is taken: the worker draws another.
      if (status) return new Response(null, { status: 409 });
      await this.ctx.storage.put({ status: "pending", code, openedAt: Date.now() });
      await this.schedule();
      return this.accept({ role: "host", ready: false }, "host");
    }
    if (role === "host-resume") {
      if (status !== "open") return Response.json({ code: "not-found" }, { status: 404 });
      return this.accept({ role: "host", ready: false }, "host");
    }
    if (role === "guest") {
      if (status !== "open") return Response.json({ code: "not-found" }, { status: 404 });
      return this.accept({ role: "guest" }, "guest");
    }
    return new Response(null, { status: 400 });
  }

  /** The room's data while it is open; what a guest checks before joining (version, password). */
  async info(): Promise<RoomInfo | undefined> {
    return (await this.ctx.storage.get<string>("status")) === "open" ? this.ctx.storage.get<RoomInfo>("room") : undefined;
  }

  private accept(attachment: Attachment, tag: string): Response {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1], [tag]);
    pair[1].serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const size = typeof raw === "string" ? encoder.encode(raw).byteLength : raw.byteLength;
    if (size > LOBBY_LIMITS.maxMessageBytes) {
      fail(ws, "too-large", `messages are limited to ${LOBBY_LIMITS.maxMessageBytes} bytes`);
      closeSocket(ws, 1009, "too large");
      return;
    }
    const message = typeof raw === "string" ? parseLobbyClientMessage(raw) : undefined;
    if (!message) {
      fail(ws, "malformed", "not a valid lobby message");
      return;
    }
    const attachment = ws.deserializeAttachment() as Attachment;
    if (attachment.role === "host") await this.fromHost(ws, attachment, message);
    else await this.fromGuest(ws, attachment, message);
  }

  private async fromHost(ws: WebSocket, attachment: Extract<Attachment, { role: "host" }>, message: LobbyClientMessage): Promise<void> {
    const status = await this.ctx.storage.get<string>("status");
    if (message.type === "resume") {
      if (attachment.ready || status !== "open") return fail(ws, "not-allowed", "nothing to resume");
      const [room, hostToken] = [await this.ctx.storage.get<RoomInfo>("room"), await this.ctx.storage.get<string>("hostToken")];
      if (!room || message.code !== room.code || message.hostToken !== hostToken) {
        fail(ws, "not-allowed", "wrong room or token");
        return closeSocket(ws, 1008, "wrong token");
      }
      // The old socket, if the server still holds it, is stale now.
      for (const old of this.ctx.getWebSockets("host")) if (old !== ws) closeSocket(old, 1000, "replaced");
      ws.serializeAttachment({ role: "host", ready: true } satisfies Attachment);
      await this.ctx.storage.put("lastHeartbeat", Date.now());
      await this.publish(room);
      await this.schedule();
      send(ws, { type: "resumed", room, ...(await iceServersFor(this.env, room.code)) });
      return;
    }
    if (message.type === "create") {
      if (attachment.ready || status !== "pending") return fail(ws, "not-allowed", "this room already exists");
      const code = (await this.ctx.storage.get<string>("code"))!;
      const room: RoomInfo = {
        code,
        roomName: message.roomName,
        hostName: message.hostName,
        players: 1,
        maxPlayers: message.maxPlayers,
        hasPassword: message.hasPassword,
        appVersion: message.appVersion,
        protocolVersion: message.protocolVersion,
        public: message.public,
      };
      const hostToken = crypto.randomUUID();
      const now = Date.now();
      await this.ctx.storage.delete("openedAt");
      await this.ctx.storage.put({ status: "open", room, hostToken, guests: {}, nextGuest: 1, lastHeartbeat: now, emptySince: now });
      ws.serializeAttachment({ role: "host", ready: true } satisfies Attachment);
      await this.publish(room);
      await this.schedule();
      // O.3: one credential request per room connection.
      send(ws, { type: "created", code, hostToken, room, ...(await iceServersFor(this.env, code)) });
      return;
    }
    if (status !== "open" || !attachment.ready) return fail(ws, "not-allowed", "send create or resume first");
    switch (message.type) {
      case "heartbeat": {
        await this.ctx.storage.put("lastHeartbeat", Date.now());
        const room = await this.ctx.storage.get<RoomInfo>("room");
        if (room) await this.publish(room);
        await this.schedule();
        return;
      }
      case "update": {
        const room = (await this.ctx.storage.get<RoomInfo>("room"))!;
        room.players = Math.min(message.players, room.maxPlayers);
        await this.ctx.storage.put("room", room);
        // Guests playing over their data channel left the room server, but the room is not idle.
        const guests = (await this.ctx.storage.get<Record<string, Guest>>("guests")) ?? {};
        if (room.players > 1) await this.ctx.storage.delete("emptySince");
        else if (Object.keys(guests).length === 0 && (await this.ctx.storage.get<number>("emptySince")) === undefined) await this.ctx.storage.put("emptySince", Date.now());
        await this.schedule();
        await this.publish(room);
        return;
      }
      case "close":
        return this.shutdown("closed");
      case "signal": {
        if (!this.allowSignal(ws)) return fail(ws, "rate-limited", "too many signals");
        const target = message.to ? this.guestSocket(message.to) : undefined;
        if (!target) return fail(ws, "not-found", "no such guest");
        send(target, { type: "signal", from: "host", data: message.data });
        return;
      }
      default:
        return fail(ws, "not-allowed", `the host does not send ${message.type}`);
    }
  }

  private async fromGuest(ws: WebSocket, attachment: Extract<Attachment, { role: "guest" }>, message: LobbyClientMessage): Promise<void> {
    if (message.type === "join") {
      if (attachment.guestId) return fail(ws, "not-allowed", "already joined");
      const room = await this.ctx.storage.get<RoomInfo>("room");
      if (!room || message.code !== room.code) {
        fail(ws, room ? "malformed" : "not-found", "the code does not match this room");
        return closeSocket(ws, 1008, "wrong room");
      }
      if (message.protocolVersion !== room.protocolVersion) {
        fail(ws, "wrong-version", `the host runs protocol ${room.protocolVersion}`);
        return closeSocket(ws, 1008, "wrong version");
      }
      const guests = (await this.ctx.storage.get<Record<string, Guest>>("guests")) ?? {};
      if (Object.keys(guests).length + 1 >= room.maxPlayers || room.players >= room.maxPlayers) {
        fail(ws, "room-full", "the room is full");
        return closeSocket(ws, 1008, "full");
      }
      const n = (await this.ctx.storage.get<number>("nextGuest")) ?? 1;
      const guestId = `g${n}`;
      const guestToken = crypto.randomUUID();
      guests[guestId] = { name: message.playerName, token: guestToken };
      await this.ctx.storage.put({ guests, nextGuest: n + 1 });
      await this.ctx.storage.delete("emptySince");
      ws.serializeAttachment({ role: "guest", guestId } satisfies Attachment);
      send(ws, { type: "joined", guestId, guestToken, room, ...(await iceServersFor(this.env, room.code)) });
      const host = this.hostSocket();
      if (host) send(host, { type: "guest-joined", guestId, playerName: message.playerName });
      return;
    }
    if (!attachment.guestId) return fail(ws, "not-allowed", "send join first");
    if (message.type !== "signal") return fail(ws, "not-allowed", `a guest does not send ${message.type}`);
    if (!this.allowSignal(ws)) return fail(ws, "rate-limited", "too many signals");
    const host = this.hostSocket();
    if (!host) return fail(ws, "not-found", "the host is not connected");
    send(host, { type: "signal", from: attachment.guestId, data: message.data });
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.rates.delete(ws);
    closeSocket(ws, code === 1005 || code === 1006 ? 1000 : code, "bye");
    const attachment = ws.deserializeAttachment() as Attachment;
    if (attachment.role !== "guest" || !attachment.guestId) return;
    const guests = await this.ctx.storage.get<Record<string, Guest>>("guests");
    if (!guests?.[attachment.guestId]) return;
    delete guests[attachment.guestId];
    await this.ctx.storage.put("guests", guests);
    const room = await this.ctx.storage.get<RoomInfo>("room");
    if (Object.keys(guests).length === 0 && (room?.players ?? 1) <= 1) await this.ctx.storage.put("emptySince", Date.now());
    await this.schedule();
    const host = this.hostSocket();
    if (host) send(host, { type: "guest-left", guestId: attachment.guestId });
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011);
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const s = await this.ctx.storage.get<number>(["openedAt", "lastHeartbeat", "emptySince"]);
    const openedAt = s.get("openedAt");
    const lastHeartbeat = s.get("lastHeartbeat");
    const emptySince = s.get("emptySince");
    if (openedAt !== undefined && now - openedAt >= CREATE_TIMEOUT_MS) return this.shutdown("expired");
    if (lastHeartbeat !== undefined && now - lastHeartbeat >= LOBBY_LIMITS.heartbeatTimeoutMs) return this.shutdown("expired");
    if (emptySince !== undefined && now - emptySince >= LOBBY_LIMITS.idleRoomMs) return this.shutdown("idle");
    await this.schedule();
  }

  /** Sets the alarm to the nearest deadline. */
  private async schedule(): Promise<void> {
    const s = await this.ctx.storage.get<number>(["openedAt", "lastHeartbeat", "emptySince"]);
    const deadlines: number[] = [];
    const openedAt = s.get("openedAt");
    const lastHeartbeat = s.get("lastHeartbeat");
    const emptySince = s.get("emptySince");
    if (openedAt !== undefined) deadlines.push(openedAt + CREATE_TIMEOUT_MS);
    if (lastHeartbeat !== undefined) deadlines.push(lastHeartbeat + LOBBY_LIMITS.heartbeatTimeoutMs);
    if (emptySince !== undefined) deadlines.push(emptySince + LOBBY_LIMITS.idleRoomMs);
    if (deadlines.length > 0) await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  private async publish(room: RoomInfo): Promise<void> {
    if (!room.public) return;
    await directory(this.env).upsert({
      code: room.code,
      roomName: room.roomName,
      hostName: room.hostName,
      players: room.players,
      maxPlayers: room.maxPlayers,
      hasPassword: room.hasPassword,
      protocolVersion: room.protocolVersion,
    });
  }

  private async shutdown(reason: "closed" | "expired" | "idle"): Promise<void> {
    const code = await this.ctx.storage.get<string>("code");
    for (const ws of this.ctx.getWebSockets()) {
      send(ws, { type: "room-closed", reason });
      closeSocket(ws, 1000, reason);
    }
    this.rates.clear();
    if (code) await directory(this.env).remove(code);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private allowSignal(ws: WebSocket): boolean {
    const now = Date.now();
    const w = this.rates.get(ws);
    if (!w || now - w.start >= 1000) {
      this.rates.set(ws, { start: now, count: 1 });
      return true;
    }
    if (w.count >= LOBBY_LIMITS.signalsPerSecond) return false;
    w.count++;
    return true;
  }

  private hostSocket(): WebSocket | undefined {
    return this.ctx.getWebSockets("host").find((ws) => (ws.deserializeAttachment() as { ready?: boolean }).ready === true);
  }

  private guestSocket(guestId: string): WebSocket | undefined {
    return this.ctx.getWebSockets("guest").find((ws) => (ws.deserializeAttachment() as Attachment & { guestId?: string }).guestId === guestId);
  }
}
