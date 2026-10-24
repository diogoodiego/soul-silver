import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createWsListener, rawText, REMOTE_CONN_BASE, type WsListener } from "../src/server-host/ws-listener";

let listener: WsListener | undefined;
const clients: WebSocket[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.terminate();
  listener?.stop();
  listener = undefined;
});

function setup() {
  const messages: [number, unknown][] = [];
  const closed: number[] = [];
  const logs: string[] = [];
  listener = createWsListener({
    ports: [0],
    onMessage: (id, msg) => messages.push([id, msg]),
    onClose: (id) => closed.push(id),
    log: (m) => logs.push(m),
  });
  return { listener, messages, closed, logs };
}

async function connect(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  clients.push(ws);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return ws;
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};

describe("ws listener", () => {
  it("hands client JSON to the server with a remote connId and sends back", async () => {
    const { listener, messages } = setup();
    const port = await listener.start();
    const ws = await connect(port);
    const got: unknown[] = [];
    ws.on("message", (d) => got.push(JSON.parse(rawText(d))));
    ws.send(JSON.stringify({ type: "leave" }));
    await until(() => messages.length === 1);
    expect(messages[0]).toEqual([REMOTE_CONN_BASE, { type: "leave" }]);
    listener.send(REMOTE_CONN_BASE, { type: "welcome" });
    await until(() => got.length === 1);
    expect(got[0]).toEqual({ type: "welcome" });
  });

  it("numbers connections apart and reports closes", async () => {
    const { listener, messages, closed } = setup();
    const port = await listener.start();
    const a = await connect(port);
    const b = await connect(port);
    a.send("{}");
    b.send("{}");
    await until(() => messages.length === 2);
    expect(new Set(messages.map(([id]) => id)).size).toBe(2);
    a.close();
    await until(() => closed.length === 1);
  });

  it("closes a connection on request", async () => {
    const { listener, messages } = setup();
    const port = await listener.start();
    const ws = await connect(port);
    const closedClient = new Promise<void>((r) => ws.once("close", () => r()));
    ws.send("{}");
    await until(() => messages.length === 1);
    listener.close(REMOTE_CONN_BASE);
    await closedClient;
  });

  it("ignores frames that are not JSON and keeps the connection", async () => {
    const { listener, messages, logs } = setup();
    const port = await listener.start();
    const ws = await connect(port);
    ws.send("not json");
    ws.send(JSON.stringify({ ok: 1 }));
    await until(() => messages.length === 1);
    expect(logs).toHaveLength(1);
  });

  it("drops a frame above the size limit", async () => {
    const { listener, closed } = setup();
    const port = await listener.start();
    const ws = await connect(port);
    ws.send("x".repeat(1_000_001));
    await until(() => closed.length === 1);
  });

  it("tries the next port when one is taken", async () => {
    const first = createWsListener({ ports: [0], onMessage: () => {}, onClose: () => {}, log: () => {} });
    const taken = await first.start();
    try {
      listener = createWsListener({ ports: [taken, 0], onMessage: () => {}, onClose: () => {}, log: () => {} });
      expect(await listener.start()).not.toBe(taken);
    } finally {
      first.stop();
    }
  });

  it("rejects when no port binds", async () => {
    const first = createWsListener({ ports: [0], onMessage: () => {}, onClose: () => {}, log: () => {} });
    const taken = await first.start();
    try {
      listener = createWsListener({ ports: [taken], onMessage: () => {}, onClose: () => {}, log: () => {} });
      await expect(listener.start()).rejects.toThrow();
    } finally {
      first.stop();
    }
  });
});
