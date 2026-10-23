import type { ServerInfo, ServerStatus } from "./server-info";

export type HostToServerMessage =
  | { type: "init"; protocolVersion: number; appVersion: string }
  | { type: "get-info"; requestId: number };

export type ServerToHostMessage =
  | { type: "ready"; protocolVersion: number }
  | { type: "status"; status: ServerStatus }
  | { type: "info"; requestId: number; info: ServerInfo }
  | { type: "error"; code: "protocol-mismatch"; message: string };

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
    isCount(value["uptimeMs"])
  );
}

export function isHostToServerMessage(value: unknown): value is HostToServerMessage {
  if (!isRecord(value)) return false;
  switch (value["type"]) {
    case "init":
      return isCount(value["protocolVersion"]) && isNonEmptyString(value["appVersion"]);
    case "get-info":
      return isCount(value["requestId"]);
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
    default:
      return false;
  }
}
