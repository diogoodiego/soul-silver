import { DurableObject } from "cloudflare:workers";
import { LOBBY_LIMITS, type RoomSummary } from "@soulsilver/shared/lobby";

// O.1: the one Durable Object behind the public list and the per-address room limit.
// It keeps only what the list shows and hashed addresses for ten minutes.

export interface DirectoryEntry extends RoomSummary {
  protocolVersion: number;
}

export class Directory extends DurableObject<Cloudflare.Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY, room_name TEXT NOT NULL, host_name TEXT NOT NULL, players INTEGER NOT NULL,
      max_players INTEGER NOT NULL, has_password INTEGER NOT NULL, protocol INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    this.sql.exec("CREATE TABLE IF NOT EXISTS creations (ip_hash TEXT NOT NULL, at INTEGER NOT NULL)");
  }

  /** Counts one room for this address; false once it made too many in the window. */
  reserve(ipHash: string): boolean {
    const now = Date.now();
    this.sql.exec("DELETE FROM creations WHERE at < ?", now - LOBBY_LIMITS.roomsPerIpWindowMs);
    const row = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM creations WHERE ip_hash = ?", ipHash).one();
    if (row.n >= LOBBY_LIMITS.roomsPerIp) return false;
    this.sql.exec("INSERT INTO creations (ip_hash, at) VALUES (?, ?)", ipHash, now);
    return true;
  }

  upsert(entry: DirectoryEntry): void {
    this.sql.exec(
      `INSERT INTO rooms (code, room_name, host_name, players, max_players, has_password, protocol, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET room_name = excluded.room_name, host_name = excluded.host_name,
         players = excluded.players, max_players = excluded.max_players, has_password = excluded.has_password,
         protocol = excluded.protocol, updated_at = excluded.updated_at`,
      entry.code,
      entry.roomName,
      entry.hostName,
      entry.players,
      entry.maxPlayers,
      entry.hasPassword ? 1 : 0,
      entry.protocolVersion,
      Date.now(),
    );
  }

  remove(code: string): void {
    this.sql.exec("DELETE FROM rooms WHERE code = ?", code);
  }

  list(protocolVersion: number): RoomSummary[] {
    // A room refreshes its entry with every heartbeat; one that stopped is gone even if it never said so.
    this.sql.exec("DELETE FROM rooms WHERE updated_at < ?", Date.now() - LOBBY_LIMITS.heartbeatTimeoutMs);
    return this.sql
      .exec<{ code: string; room_name: string; host_name: string; players: number; max_players: number; has_password: number }>(
        `SELECT code, room_name, host_name, players, max_players, has_password FROM rooms
         WHERE protocol = ? ORDER BY updated_at DESC LIMIT ?`,
        protocolVersion,
        LOBBY_LIMITS.listMax,
      )
      .toArray()
      .map((r) => ({
        code: r.code,
        roomName: r.room_name,
        hostName: r.host_name,
        players: r.players,
        maxPlayers: r.max_players,
        hasPassword: r.has_password === 1,
      }));
  }
}

export function directory(env: Cloudflare.Env): DurableObjectStub<Directory> {
  return env.DIRECTORY.get(env.DIRECTORY.idFromName("directory"));
}
