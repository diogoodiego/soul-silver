import { SERVER_UNAVAILABLE, type ServerInfo, type SessionResult } from "@soulsilver/shared";
import type { SessionListing } from "@soulsilver/shared/lan";
import { migrate, type Save, type SaveResult } from "@soulsilver/shared/save";
import type { HostAnnouncement } from "./discovery";
import type { SaveStore } from "./save-store";

// Starts, joins and ends sessions, and writes the saves the server sends (spec 012).

export interface SessionControllerDeps {
  saves: Pick<SaveStore, "load" | "write">;
  server: {
    connectGame(): void;
    sendGame(msg: unknown): void;
    listen(): Promise<number>;
    unlisten(): void;
    getInfo(): Promise<ServerInfo>;
  };
  remote: {
    connect(address: string): Promise<void>;
    send(msg: unknown): void;
    close(): void;
  };
  discovery: {
    announce(host: HostAnnouncement): () => void;
    watch(listener: (sessions: SessionListing[]) => void): () => void;
  };
  protocolVersion: number;
  newSessionId(): string;
  /** To the renderer. */
  emit: {
    gameMessage(msg: unknown): void;
    gameClosed(): void;
    saved(result: SaveResult): void;
    sessions: (list: SessionListing[]) => void;
  };
  /** How long shutdown() waits for the final saves. */
  shutdownWaitMs?: number;
  log(message: string): void;
}

type Mode = "solo" | "host" | "guest";

export function createSessionController(deps: SessionControllerDeps) {
  let active: { slot: number; mode: Mode } | undefined;
  let stopAnnounce: (() => void) | undefined;
  let stopWatch: (() => void) | undefined;
  let closedWaiters: (() => void)[] = [];

  function send(msg: unknown): void {
    if (active?.mode === "guest") deps.remote.send(msg);
    else deps.server.sendGame(msg);
  }

  function end(): void {
    if (!active) return;
    const { mode } = active;
    active = undefined;
    stopAnnounce?.();
    stopAnnounce = undefined;
    if (mode === "host") deps.server.unlisten();
    if (mode === "guest") deps.remote.close();
    deps.emit.gameClosed();
    const waiters = closedWaiters;
    closedWaiters = [];
    for (const w of waiters) w();
  }

  /** Writes a save the server sent and tells it so (the host waits for this when closing). */
  async function onSave(slot: number, raw: unknown): Promise<void> {
    const migrated = migrate(raw);
    if (!migrated.ok) {
      deps.log(`Discarded a save from the server: ${migrated.message}`);
      return;
    }
    const result = await deps.saves.write(slot, migrated.save);
    deps.emit.saved(result);
    if (result.ok && active?.slot === slot) send({ type: "save-ack", rev: migrated.save.rev });
  }

  function onMessage(msg: unknown): void {
    const m = msg as { type?: unknown; save?: unknown } | null;
    if (typeof m === "object" && m !== null && m.type === "save" && active) void onSave(active.slot, m.save);
    deps.emit.gameMessage(msg);
  }

  function announce(hostName: string, port: number): void {
    stopAnnounce = deps.discovery.announce({
      sessionId: deps.newSessionId(),
      hostName,
      port,
      maxPlayers: 4,
      protocolVersion: deps.protocolVersion,
      players: async () => (await deps.server.getInfo()).players,
    });
  }

  async function start(slot: number, mode: Mode, open: (save: Save) => Promise<void>): Promise<SessionResult> {
    const loaded = await deps.saves.load(slot);
    if (!loaded.ok) return { ok: false, reason: loaded.reason };
    try {
      await open(loaded.save);
    } catch (error) {
      return { ok: false, reason: (error as Error).message === SERVER_UNAVAILABLE ? "O servidor de jogo está indisponível." : (error as Error).message };
    }
    active = { slot, mode };
    return { ok: true, save: loaded.save };
  }

  return {
    onServerMessage: onMessage,
    onRemoteMessage: onMessage,
    /** The local connection to the server was closed by the server. */
    onServerClosed(): void {
      if (active && active.mode !== "guest") end();
    },
    /** The socket to the host closed. */
    onRemoteClosed(): void {
      if (active?.mode === "guest") end();
    },
    sendGame: send,

    startSolo: (slot: number) =>
      start(slot, "solo", () => {
        deps.server.connectGame();
        return Promise.resolve();
      }),

    startHost: (slot: number) =>
      start(slot, "host", async (save) => {
        const port = await deps.server.listen();
        deps.server.connectGame();
        announce(save.name, port);
      }),

    /** Opens the solo session being played to the LAN, without restarting it; resolves with the port. */
    async openToLan(): Promise<{ ok: true; port: number } | { ok: false; reason: string }> {
      const at = active;
      if (at?.mode !== "solo") return { ok: false, reason: "Só uma partida sozinho pode ser aberta na rede." };
      const loaded = await deps.saves.load(at.slot);
      if (!loaded.ok) return { ok: false, reason: loaded.reason };
      let port: number;
      try {
        port = await deps.server.listen();
      } catch (error) {
        return { ok: false, reason: (error as Error).message };
      }
      // The session ended while the port opened.
      if (active !== at) {
        deps.server.unlisten();
        return { ok: false, reason: "A partida terminou." };
      }
      announce(loaded.save.name, port);
      at.mode = "host";
      return { ok: true, port };
    },

    joinSession: (slot: number, address: string) => start(slot, "guest", () => deps.remote.connect(address)),

    watchSessions(on: boolean): void {
      stopWatch?.();
      stopWatch = on ? deps.discovery.watch(deps.emit.sessions) : undefined;
    },

    /** Leaves the current session and waits for the final saves (app quit). */
    async shutdown(): Promise<void> {
      stopWatch?.();
      if (!active) return;
      send({ type: "leave" });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, deps.shutdownWaitMs ?? 3500);
        closedWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
