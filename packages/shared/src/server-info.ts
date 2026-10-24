export type ServerState = "starting" | "running" | "stopped";

export interface ServerStatus {
  state: ServerState;
  /** Ticks counted since the loop started; integer >= 0, never decreases while running. */
  tick: number;
}

export interface ServerInfo {
  appVersion: string;
  protocolVersion: number;
  serverStatus: ServerStatus;
  tickRateHz: 20;
  uptimeMs: number;
  /** Players in the current session (connected or reserved); 0 without one. */
  players: number;
  maxPlayers: number;
}
