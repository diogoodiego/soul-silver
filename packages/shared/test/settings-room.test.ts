import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, readSettings, settingsPatch } from "../src/settings.ts";

// R.1: the room password the host asks of guests; empty means no password.

describe("room password setting", () => {
  it("starts empty and old settings files get it empty", () => {
    expect(DEFAULT_SETTINGS.roomPassword).toBe("");
    expect(readSettings({ crt: false }).roomPassword).toBe("");
  });

  it("has a public STUN server by default for invites (R.3), takes another or none, and refuses other schemes", () => {
    expect(DEFAULT_SETTINGS.stunServer).toMatch(/^stun:/);
    expect(readSettings({}).stunServer).toBe(DEFAULT_SETTINGS.stunServer);
    for (const ok of ["stun:stun.example.org:3478", "stuns:stun.example.org", ""]) expect(settingsPatch.safeParse({ stunServer: ok }).success).toBe(true);
    for (const bad of ["http://evil", "turn:x", "x".repeat(201)]) expect(settingsPatch.safeParse({ stunServer: bad }).success).toBe(false);
  });

  it("keeps up to 64 characters and refuses more", () => {
    expect(settingsPatch.safeParse({ roomPassword: "pikachu" }).success).toBe(true);
    expect(settingsPatch.safeParse({ roomPassword: "x".repeat(65) }).success).toBe(false);
  });
});
