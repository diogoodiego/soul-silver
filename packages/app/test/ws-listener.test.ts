import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createWsListener, portLink, rawText, REMOTE_CONN_BASE, type WsListener } from "../src/server-host/ws-listener";

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

  describe("room password (R.1)", () => {
    const hello = (roomPassword?: string) => JSON.stringify({ type: "hello", protocolVersion: 1, save: {}, ...(roomPassword === undefined ? {} : { roomPassword }) });

    async function guarded(password: string, now = () => 0) {
      const messages: [number, unknown][] = [];
      const closed: number[] = [];
      listener = createWsListener({ ports: [0], onMessage: (id, msg) => messages.push([id, msg]), onClose: (id) => closed.push(id), log: () => {}, now });
      const port = await listener.start(password);
      return { port, messages, closed };
    }

    /** Sends a hello and resolves with the reject the listener answered, if any, once the socket closes or the hello passes. */
    async function attempt(port: number, roomPassword?: string): Promise<{ code: string; message: string } | undefined> {
      const ws = await connect(port);
      return new Promise((resolve) => {
        let reject: { code: string; message: string } | undefined;
        ws.on("message", (d) => {
          const msg = JSON.parse(rawText(d)) as { type: string; code: string; message: string };
          if (msg.type === "reject") reject = msg;
        });
        ws.once("close", () => resolve(reject));
        ws.send(hello(roomPassword));
        setTimeout(() => resolve(reject), 300);
      });
    }

    it("lets a hello with the right password through", async () => {
      const { port, messages } = await guarded("pikachu");
      expect(await attempt(port, "pikachu")).toBeUndefined();
      await until(() => messages.length === 1);
      expect(messages[0]![1]).toMatchObject({ type: "hello", roomPassword: "pikachu" });
    });

    it.each([["a wrong password", "raichu"], ["no password", undefined]])("refuses %s without telling the server", async (_label, given) => {
      const { port, messages, closed } = await guarded("pikachu");
      expect(await attempt(port, given)).toMatchObject({ code: "wrong-password" });
      expect(messages).toEqual([]);
      expect(closed).toEqual([]);
    });

    it("needs nothing when the session has no password", async () => {
      const { port, messages } = await guarded("");
      expect(await attempt(port)).toBeUndefined();
      await until(() => messages.length === 1);
    });

    it("only checks the first message of a connection", async () => {
      const { port, messages } = await guarded("pikachu");
      const ws = await connect(port);
      ws.send(hello("pikachu"));
      ws.send(JSON.stringify({ type: "leave" }));
      await until(() => messages.length === 2);
    });

    it("blocks an address after 5 wrong tries in a minute, even with the right password, then lets it in again", async () => {
      let clock = 0;
      const { port } = await guarded("pikachu", () => clock);
      for (let i = 0; i < 5; i++) expect(await attempt(port, "x")).toMatchObject({ code: "wrong-password" });
      expect((await attempt(port, "pikachu"))?.message).toMatch(/tentativas/);
      clock = 60_001;
      expect(await attempt(port, "pikachu")).toBeUndefined();
    });
  });

  describe("adopted links (R.3)", () => {
    function fakeLink() {
      const sent: string[] = [];
      let onMessage: (text: string) => void = () => {};
      let onClose: () => void = () => {};
      let closed = false;
      const link = {
        remote: "peer",
        send: (text: string) => sent.push(text),
        close: () => {
          closed = true;
          onClose();
        },
        onMessage: (l: (text: string) => void) => (onMessage = l),
        onClose: (l: () => void) => (onClose = l),
      };
      return { link, sent, receive: (msg: unknown) => onMessage(JSON.stringify(msg)), hangUp: () => onClose(), isClosed: () => closed };
    }

    it("numbers an adopted link like a socket and relays both ways", async () => {
      const { listener, messages, closed } = setup();
      await listener.start();
      const peer = fakeLink();
      const id = listener.adopt(peer.link);
      expect(id).toBeGreaterThanOrEqual(REMOTE_CONN_BASE);
      peer.receive({ type: "leave" });
      expect(messages).toEqual([[id, { type: "leave" }]]);
      listener.send(id, { type: "welcome" });
      expect(peer.sent.map((s) => JSON.parse(s) as unknown)).toEqual([{ type: "welcome" }]);
      peer.hangUp();
      expect(closed).toEqual([id]);
    });

    it("asks an adopted link for the room password too", async () => {
      const { listener, messages } = setup();
      await listener.start("pikachu");
      const peer = fakeLink();
      listener.adopt(peer.link);
      peer.receive({ type: "hello", protocolVersion: 1, save: {}, roomPassword: "raichu" });
      expect(messages).toEqual([]);
      expect(JSON.parse(peer.sent[0]!)).toMatchObject({ type: "reject", code: "wrong-password" });
      expect(peer.isClosed()).toBe(true);
    });

    it("closes adopted links when it stops", async () => {
      const { listener, closed } = setup();
      await listener.start();
      const peer = fakeLink();
      const id = listener.adopt(peer.link);
      listener.stop();
      expect(peer.isClosed()).toBe(true);
      expect(closed).toEqual([id]);
    });
  });

  describe("portLink (R.3)", () => {
    function fakeMainPort() {
      const posted: unknown[] = [];
      const handlers: { message: ((e: { data: unknown }) => void)[]; close: (() => void)[] } = { message: [], close: [] };
      let closed = false;
      const port = {
        postMessage: (d: unknown) => posted.push(d),
        on: (event: "message" | "close", l: never) => handlers[event].push(l),
        start: () => {},
        close: () => {
          closed = true;
        },
      };
      return { port, posted, deliver: (data: unknown) => handlers.message.forEach((l) => l({ data })), hangUp: () => handlers.close.forEach((l) => l()), isClosed: () => closed };
    }

    it("passes text, reports null or the port going as one close, and says null when it closes", () => {
      const p = fakeMainPort();
      const link = portLink(p.port, "convite 1");
      const got: string[] = [];
      let closes = 0;
      link.onMessage((t) => got.push(t));
      link.onClose(() => closes++);
      p.deliver("{}");
      p.deliver(42);
      expect(got).toEqual(["{}"]);
      link.send("out");
      expect(p.posted).toEqual(["out"]);
      p.deliver(null);
      p.hangUp();
      expect(closes).toBe(1);
      expect(p.isClosed()).toBe(true);
    });

    it("tells the renderer when the server closes it", () => {
      const p = fakeMainPort();
      const link = portLink(p.port, "convite 1");
      link.close();
      expect(p.posted).toEqual([null]);
      expect(p.isClosed()).toBe(true);
    });
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
