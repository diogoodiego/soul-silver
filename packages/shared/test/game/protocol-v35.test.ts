import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "../../src/game/protocol.ts";
import { PROTOCOL_VERSION } from "../../src/protocol-version.ts";

// R.1: the room password in the hello and the reject for a wrong one.

describe("protocol v35", () => {
  it("is at least version 35", () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(35);
  });

  it("accepts a hello with or without a room password", () => {
    expect(clientMessage.safeParse({ type: "hello", protocolVersion: 35, save: {}, roomPassword: "pikachu" }).success).toBe(true);
    expect(clientMessage.safeParse({ type: "hello", protocolVersion: 35, save: {} }).success).toBe(true);
  });

  it("refuses a room password over 64 characters", () => {
    expect(clientMessage.safeParse({ type: "hello", protocolVersion: 35, save: {}, roomPassword: "x".repeat(65) }).success).toBe(false);
  });

  it("has a wrong-password reject", () => {
    expect(serverMessage.safeParse({ type: "reject", code: "wrong-password", message: "Senha da sala incorreta.", serverProtocolVersion: 35 }).success).toBe(true);
  });
});
