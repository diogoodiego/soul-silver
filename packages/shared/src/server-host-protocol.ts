import type { ServerInfo, ServerStatus } from "./server-info";

export type HostToServerMessage =
  | { type: "init"; protocolVersion: number; appVersion: string }
  | { type: "get-info"; requestId: number }
  /** Opens the LAN socket for other PCs (hosted session); solo never sends it. */
  | { type: "listen" }
  | { type: "unlisten" }
  /** A game client message; the first one for a connId opens the connection. Validated by the game server. */
  | { type: "client-message"; connId: number; msg: unknown }
  | { type: "client-close"; connId: number };

export type ServerToHostMessage =
  | { type: "ready"; protocolVersion: number }
  | { type: "status"; status: ServerStatus }
  | { type: "info"; requestId: number; info: ServerInfo }
  | { type: "error"; code: "protocol-mismatch"; message: string }
  | { type: "listening"; port: number }
  | { type: "listen-failed"; message: string }
  | { type: "client-send"; connId: number; msg: unknown }
  | { type: "client-close"; connId: number };

type Fields = Record<string, unknown>;

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isServerStatus(value: unknown): value is ServerStatus {
  return (
    isRecord(value) &&
    (value["state"] === "starting" || value["state"] === "running" || value["state"] === "stopped") &&
    isCount(value["tick"])
  );
}

function isServerInfo(value: unknown): value is ServerInfo {
  return (
    isRecord(value) &&
    isNonEmptyString(value["appVersion"]) &&
    isCount(value["protocolVersion"]) &&
    isServerStatus(value["serverStatus"]) &&
    value["tickRateHz"] === 20 &&
    isCount(value["uptimeMs"]) &&
    isCount(value["players"]) &&
    isCount(value["maxPlayers"])
  );
}

export function isHostToServerMessage(value: unknown): value is HostToServerMessage {
  if (!isRecord(value)) return false;
  switch (value["type"]) {
    case "init":
      return isCount(value["protocolVersion"]) && isNonEmptyString(value["appVersion"]);
    case "get-info":
      return isCount(value["requestId"]);
    case "listen":
    case "unlisten":
      return true;
    case "client-message":
      return isCount(value["connId"]) && "msg" in value;
    case "client-close":
      return isCount(value["connId"]);
    default:
      return false;
  }
}

export function isServerToHostMessage(value: unknown): value is ServerToHostMessage {
  if (!isRecord(value)) return false;
  switch (value["type"]) {
    case "ready":
      return isCount(value["protocolVersion"]);
    case "status":
      return isServerStatus(value["status"]);
    case "info":
      return isCount(value["requestId"]) && isServerInfo(value["info"]);
    case "error":
      return value["code"] === "protocol-mismatch" && typeof value["message"] === "string";
    case "listening":
      return isCount(value["port"]);
    case "listen-failed":
      return typeof value["message"] === "string";
    case "client-send":
      return isCount(value["connId"]) && "msg" in value;
    case "client-close":
      return isCount(value["connId"]);
    default:
      return false;
  }
}
