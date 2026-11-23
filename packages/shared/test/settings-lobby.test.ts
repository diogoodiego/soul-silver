import { describe, expect, it } from "vitest";
import { DEFAULT_LOBBY_URL, DEFAULT_STUN } from "../src/lobby/index.ts";
import { DEFAULT_SETTINGS, readSettings, settingsPatch } from "../src/settings.ts";

// O.4: the room server's address and Cloudflare's STUN as defaults.

describe("online settings", () => {
  it("default to the published room server and Cloudflare's STUN", () => {
    expect(DEFAULT_SETTINGS.lobbyServer).toBe(DEFAULT_LOBBY_URL);
    expect(DEFAULT_SETTINGS.stunServer).toBe(DEFAULT_STUN);
    expect(readSettings({}).lobbyServer).toBe(DEFAULT_LOBBY_URL);
  });

  it("move settings still on the old Google default to the new STUN, and keep any other choice", () => {
    expect(readSettings({ stunServer: "stun:stun.l.google.com:19302" }).stunServer).toBe(DEFAULT_STUN);
    expect(readSettings({ stunServer: "stun:meu.stun.example:3478" }).stunServer).toBe("stun:meu.stun.example:3478");
    expect(readSettings({ stunServer: "" }).stunServer).toBe("");
  });

  it("take an http(s) room server address only", () => {
    expect(settingsPatch.safeParse({ lobbyServer: "http://127.0.0.1:8787" }).success).toBe(true);
    expect(settingsPatch.safeParse({ lobbyServer: "https://salas.example.dev" }).success).toBe(true);
    expect(settingsPatch.safeParse({ lobbyServer: "ftp://x" }).success).toBe(false);
    expect(settingsPatch.safeParse({ lobbyServer: "não é endereço" }).success).toBe(false);
    expect(readSettings({ lobbyServer: "lixo" }).lobbyServer).toBe(DEFAULT_LOBBY_URL);
  });
});
