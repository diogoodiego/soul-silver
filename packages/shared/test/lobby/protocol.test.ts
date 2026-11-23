import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  DEFAULT_LOBBY_URL,
  DEFAULT_STUN,
  formatRoomCode,
  isRoomCode,
  readRoomCode,
  lobbySocketUrl,
  LOBBY_PROTOCOL,
  parseLobbyClientMessage,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "../../src/lobby/index.ts";

// O.1: the messages the app and the room server exchange, validated on both sides.

const create = {
  type: "create",
  lobbyProtocol: LOBBY_PROTOCOL,
  roomName: "Sala do Gold",
  hostName: "Gold",
  appVersion: "0.5.3",
  protocolVersion: 48,
  maxPlayers: 4,
  public: true,
  hasPassword: false,
};

describe("room codes", () => {
  it("leave out characters that read alike", () => {
    for (const c of "0O1IL") expect(ROOM_CODE_ALPHABET).not.toContain(c);
  });

  it("are six characters of the alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isRoomCode(code)).toBe(true);
    }
  });

  it("follow the random source given", () => {
    const zeros = () => new Uint8Array(ROOM_CODE_LENGTH);
    expect(generateRoomCode((bytes) => bytes.set(zeros()))).toBe(ROOM_CODE_ALPHABET[0]!.repeat(ROOM_CODE_LENGTH));
  });

  it("reject other text", () => {
    for (const bad of ["", "ABCDE", "ABCDEFG", "abcdef", "ABCDE0", "ABCDEO", "ABC DE"]) expect(isRoomCode(bad)).toBe(false);
  });
});

describe("client messages", () => {
  it("accept a valid create", () => {
    expect(parseLobbyClientMessage(JSON.stringify(create))).toEqual(create);
  });

  it("accept join, update, heartbeat, close and signal", () => {
    const valid = [
      { type: "join", lobbyProtocol: LOBBY_PROTOCOL, code: "ABCDEF", playerName: "Lyra", appVersion: "0.5.3", protocolVersion: 48 },
      { type: "update", players: 2 },
      { type: "heartbeat" },
      { type: "close" },
      { type: "signal", to: "g1", data: { sdp: "v=0" } },
      { type: "signal", data: { candidate: "a=candidate:1" } },
    ];
    for (const m of valid) expect(parseLobbyClientMessage(JSON.stringify(m))).toEqual(m);
  });

  it("reject malformed messages", () => {
    const bad: unknown[] = [
      "not json",
      42,
      { type: "nope" },
      { ...create, lobbyProtocol: 2 },
      { ...create, maxPlayers: 1 },
      { ...create, maxPlayers: 5 },
      { ...create, roomName: "" },
      { ...create, roomName: "x".repeat(41) },
      { ...create, hostName: undefined },
      { type: "join", lobbyProtocol: LOBBY_PROTOCOL, code: "abc" },
      { type: "update", players: 0 },
      { type: "signal" },
    ];
    for (const m of bad) expect(parseLobbyClientMessage(typeof m === "string" ? m : JSON.stringify(m))).toBeUndefined();
  });
});

describe("room server address", () => {
  it("turns the http(s) base into a WebSocket URL", () => {
    expect(lobbySocketUrl("https://lobby.example.dev", "/host")).toBe("wss://lobby.example.dev/host");
    expect(lobbySocketUrl("https://lobby.example.dev/", "join/ABCDEF")).toBe("wss://lobby.example.dev/join/ABCDEF");
    expect(lobbySocketUrl("http://127.0.0.1:8787", "/host")).toBe("ws://127.0.0.1:8787/host");
  });

  it("points at the published Worker by default", () => {
    expect(DEFAULT_LOBBY_URL).toBe("https://soulsilver-lobby.diogo-soul-silver.workers.dev");
    expect(DEFAULT_STUN).toBe("stun:stun.cloudflare.com:3478");
  });
});

describe("typed codes", () => {
  it("read with any case, dash or spaces, and print with a dash", () => {
    expect(readRoomCode("k7p-2qx")).toBe("K7P2QX");
    expect(readRoomCode(" K7P 2QX ")).toBe("K7P2QX");
    expect(readRoomCode("K7P-2Q")).toBeUndefined();
    expect(formatRoomCode("K7P2QX")).toBe("K7P-2QX");
  });
});
