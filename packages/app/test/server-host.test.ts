import { EventEmitter } from "node:events";
import { PROTOCOL_VERSION, type HostToServerMessage, type ServerInfo, type ServerStatus } from "@soulsilver/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerHost } from "../src/main/server-host";

class FakeChild extends EventEmitter {
  posted: HostToServerMessage[] = [];
  postMessage(msg: HostToServerMessage) {
    this.posted.push(msg);
  }
  kill() {
    this.emit("exit", 0);
    return true;
  }
}

function infoReply(requestId: number): { type: "info"; requestId: number; info: ServerInfo } {
  return {
    type: "info",
    requestId,
    info: {
      appVersion: "0.1.0",
      protocolVersion: 1,
      serverStatus: { state: "running", tick: 5 },
      tickRateHz: 20,
      uptimeMs: 250,
      players: 0,
      maxPlayers: 4,
    },
  };
}

function setup() {
  const child = new FakeChild();
  const statuses: ServerStatus[] = [];
  const gameMessages: unknown[] = [];
  let gameClosed = 0;
  const host = createServerHost({
    onGameMessage: (msg) => gameMessages.push(msg),
    onGameClosed: () => {
      gameClosed++;
    },
    fork: () => child,
    appVersion: "0.1.0",
    onStatus: (s) => statuses.push(s),
    log: () => {},
  });
  host.start();
  return { child, statuses, host, gameMessages, gameClosed: () => gameClosed };
}

function requestIdOf(msg: HostToServerMessage | undefined): number {
  if (msg?.type !== "get-info") throw new Error("expected a get-info message");
  return msg.requestId;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createServerHost", () => {
  it("sends init on start and is starting until the first status", () => {
    const { child, host, statuses } = setup();
    expect(child.posted).toEqual([{ type: "init", protocolVersion: PROTOCOL_VERSION, appVersion: "0.1.0" }]);
    expect(host.getStatus()).toEqual({ state: "starting", tick: 0 });
    child.emit("message", { type: "status", status: { state: "running", tick: 1 } });
    expect(host.getStatus()).toEqual({ state: "running", tick: 1 });
    expect(statuses).toEqual([{ state: "running", tick: 1 }]);
  });

  it("resolves getInfo with the reply matching its requestId", async () => {
    const { child, host } = setup();
    const first = host.getInfo();
    const second = host.getInfo();
    const a = requestIdOf(child.posted[1]);
    const b = requestIdOf(child.posted[2]);
    expect(a).not.toBe(b);
    child.emit("message", infoReply(b));
    child.emit("message", infoReply(a));
    await expect(first).resolves.toEqual(infoReply(a).info);
    await expect(second).resolves.toEqual(infoReply(b).info);
  });

  it("rejects with server-unavailable after 2000 ms without reply", async () => {
    const { host } = setup();
    const assertion = expect(host.getInfo()).rejects.toThrow("server-unavailable");
    vi.advanceTimersByTime(2000);
    await assertion;
  });

  it("ignores unknown requestIds and invalid messages", () => {
    const { child, host } = setup();
    expect(() => {
      child.emit("message", infoReply(999));
      child.emit("message", { type: "nonsense" });
      child.emit("message", null);
    }).not.toThrow();
    expect(host.getStatus().state).toBe("starting");
  });

  it("on exit: stopped, keeps the last tick, rejects pending, notifies once", async () => {
    const { child, host, statuses } = setup();
    child.emit("message", { type: "status", status: { state: "running", tick: 7 } });
    const pending = host.getInfo();
    child.emit("exit", 1);
    await expect(pending).rejects.toThrow("server-unavailable");
    expect(host.getStatus()).toEqual({ state: "stopped", tick: 7 });
    expect(statuses.filter((s) => s.state === "stopped")).toEqual([{ state: "stopped", tick: 7 }]);
    await expect(host.getInfo()).rejects.toThrow("server-unavailable");
  });

  it("forwards game messages on the current connection and closes the previous one on reconnect", () => {
    const { child, host } = setup();
    host.connectGame();
    host.sendGame({ type: "hello" });
    host.connectGame();
    host.sendGame({ type: "leave" });
    expect(child.posted.slice(1)).toEqual([
      { type: "client-message", connId: 1, msg: { type: "hello" } },
      { type: "client-close", connId: 1 },
      { type: "client-message", connId: 2, msg: { type: "leave" } },
    ]);
  });

  it("delivers server messages and closes for the current connection only", () => {
    const { child, host, gameMessages, gameClosed } = setup();
    host.connectGame();
    host.connectGame();
    child.emit("message", { type: "client-send", connId: 1, msg: "stale" });
    child.emit("message", { type: "client-send", connId: 2, msg: "fresh" });
    child.emit("message", { type: "client-close", connId: 1 });
    expect(gameMessages).toEqual(["fresh"]);
    expect(gameClosed()).toBe(0);
    child.emit("message", { type: "client-close", connId: 2 });
    expect(gameClosed()).toBe(1);
  });

  it("drops game sends before connecting", () => {
    const { child, host } = setup();
    host.sendGame({ type: "hello" });
    expect(child.posted).toHaveLength(1);
  });

  it("asks the server to listen and resolves with the bound port", async () => {
    const { child, host } = setup();
    const port = host.listen();
    expect(child.posted.at(-1)).toEqual({ type: "listen" });
    child.emit("message", { type: "listening", port: 47801 });
    await expect(port).resolves.toBe(47801);
  });

  it("rejects listen with the server reason", async () => {
    const { child, host } = setup();
    const port = host.listen();
    child.emit("message", { type: "listen-failed", message: "porta ocupada" });
    await expect(port).rejects.toThrow("porta ocupada");
  });

  it("times out a listen the server never answers", async () => {
    vi.useFakeTimers();
    try {
      const { host } = setup();
      const port = host.listen();
      const assertion = expect(port).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("tells the server to stop listening", () => {
    const { child, host } = setup();
    host.unlisten();
    expect(child.posted.at(-1)).toEqual({ type: "unlisten" });
  });
});
