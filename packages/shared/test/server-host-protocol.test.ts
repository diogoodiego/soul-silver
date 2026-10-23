import { describe, expect, it } from "vitest";
import { isHostToServerMessage, isServerToHostMessage } from "../src/server-host-protocol";

const info = {
  appVersion: "0.1.0",
  protocolVersion: 1,
  serverStatus: { state: "running", tick: 3 },
  tickRateHz: 20,
  uptimeMs: 150,
};

describe("isHostToServerMessage", () => {
  it.each([
    { type: "init", protocolVersion: 1, appVersion: "0.1.0" },
    { type: "get-info", requestId: 1 },
  ])("accepts %o", (msg) => {
    expect(isHostToServerMessage(msg)).toBe(true);
  });

  it.each([
    null,
    "init",
    42,
    {},
    { type: "boom" },
    { type: "init", protocolVersion: "1", appVersion: "0.1.0" },
    { type: "init", protocolVersion: 1 },
    { type: "get-info", requestId: "1" },
    { type: "ready", protocolVersion: 1 },
  ])("rejects %o", (msg) => {
    expect(isHostToServerMessage(msg)).toBe(false);
  });
});

describe("isServerToHostMessage", () => {
  it.each([
    { type: "ready", protocolVersion: 1 },
    { type: "status", status: { state: "running", tick: 0 } },
    { type: "info", requestId: 7, info },
    { type: "error", code: "protocol-mismatch", message: "expected 1, got 2" },
  ])("accepts %o", (msg) => {
    expect(isServerToHostMessage(msg)).toBe(true);
  });

  it.each([
    null,
    [],
    { type: "status", status: { state: "paused", tick: 0 } },
    { type: "status", status: { state: "running", tick: -1 } },
    { type: "status", status: { state: "running", tick: 1.5 } },
    { type: "info", requestId: "7", info },
    { type: "info", requestId: 7, info: { ...info, tickRateHz: 30 } },
    { type: "info", requestId: 7, info: { ...info, appVersion: "" } },
    { type: "error", code: "other", message: "x" },
    { type: "get-info", requestId: 1 },
  ])("rejects %o", (msg) => {
    expect(isServerToHostMessage(msg)).toBe(false);
  });
});
