import { afterEach, describe, expect, it } from "vitest";
import { createRemoteClient, parseAddress, type RemoteClient } from "../src/main/remote-connection";
import { createWsListener, REMOTE_CONN_BASE, type WsListener } from "../src/server-host/ws-listener";

describe("parseAddress", () => {
  it.each([
    ["192.168.0.10", { host: "192.168.0.10", port: 47800 }],
    [" 192.168.0.10:47805 ", { host: "192.168.0.10", port: 47805 }],
    ["pc-do-ze", { host: "pc-do-ze", port: 47800 }],
    // R.2: IPv6, bracketed when a port follows.
    ["[2804:14c:65:1::10]:47805", { host: "2804:14c:65:1::10", port: 47805 }],
    ["[2804:14c:65:1::10]", { host: "2804:14c:65:1::10", port: 47800 }],
    ["2804:14c:65:1::10", { host: "2804:14c:65:1::10", port: 47800 }],
    ["::1", { host: "::1", port: 47800 }],
  ])("parses %j", (text, expected) => {
    expect(parseAddress(text)).toEqual(expected);
  });

  it.each(["", "a b", "1.2.3.4:", "1.2.3.4:0", "1.2.3.4:70000", "ws://1.2.3.4", "1.2.3.4:80:80", "[2804::1", "[2804::1]:", "[2804::1]:0", "[zz::1]", "2804:::1", "[1.2.3.4]"])("rejects %j", (text) => {
    expect(parseAddress(text)).toBeUndefined();
  });
});

let listener: WsListener | undefined;
let client: RemoteClient | undefined;
afterEach(() => {
  client?.close();
  listener?.stop();
  client = listener = undefined;
});

async function host() {
  const received: unknown[] = [];
  listener = createWsListener({ ports: [0], onMessage: (_id, msg) => received.push(msg), onClose: () => {}, log: () => {} });
  const port = await listener.start();
  return { port, received };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};

const hello = { type: "hello", protocolVersion: 4, save: { name: "Gold" } };

describe("remote client", () => {
  it("connects, relays both ways and reports the host closing", async () => {
    const { port, received } = await host();
    const got: unknown[] = [];
    let closed = 0;
    client = createRemoteClient({ onMessage: (m) => got.push(m), onClose: () => closed++, log: () => {} });
    await client.connect(`127.0.0.1:${port}`);
    client.send({ type: "leave" });
    await until(() => received.length === 1);
    listener!.send(REMOTE_CONN_BASE, { type: "session-closed" });
    await until(() => got.length === 1);
    listener!.close(REMOTE_CONN_BASE);
    await until(() => closed === 1);
  });

  it("puts the room password in the hello and keeps it for a reconnect to the same host (R.1)", async () => {
    const { port, received } = await host();
    client = createRemoteClient({ onMessage: () => {}, onClose: () => {}, log: () => {} });
    await client.connect(`127.0.0.1:${port}`, "pikachu");
    client.send(hello);
    await until(() => received.length === 1);
    expect(received[0]).toMatchObject({ roomPassword: "pikachu" });
    await client.connect(`127.0.0.1:${port}`);
    client.send(hello);
    await until(() => received.length === 2);
    expect(received[1]).toMatchObject({ roomPassword: "pikachu" });
  });

  it.each(["127.0.0.1", "[::1]"])("reaches a host listening on IPv4 and IPv6 through %s (R.2)", async (ip) => {
    const { port, received } = await host();
    client = createRemoteClient({ onMessage: () => {}, onClose: () => {}, log: () => {} });
    await client.connect(`${ip}:${port}`);
    client.send({ type: "leave" });
    await until(() => received.length === 1);
  });

  it("sends no password field when none was given", async () => {
    const { port, received } = await host();
    client = createRemoteClient({ onMessage: () => {}, onClose: () => {}, log: () => {} });
    await client.connect(`127.0.0.1:${port}`);
    client.send(hello);
    await until(() => received.length === 1);
    expect(received[0]).not.toHaveProperty("roomPassword");
  });

  it("explains a refused connection", async () => {
    const { port } = await host();
    listener!.stop();
    client = createRemoteClient({ onMessage: () => {}, onClose: () => {}, log: () => {} });
    await expect(client.connect(`127.0.0.1:${port}`)).rejects.toThrow(/ninguém está hospedando/);
  });

  it("explains an invalid address", async () => {
    client = createRemoteClient({ onMessage: () => {}, onClose: () => {}, log: () => {} });
    await expect(client.connect("not an address")).rejects.toThrow(/Endereço inválido/);
  });

  it("adds the reconnect token it saw in a welcome to a later hello for the same host and name", async () => {
    const { port, received } = await host();
    client = createRemoteClient({ onMessage: () => {}, onClose: () => {}, log: () => {} });
    await client.connect(`127.0.0.1:${port}`);
    client.send(hello);
    await until(() => received.length === 1);
    expect(received[0]).toEqual(hello);
    listener!.send(REMOTE_CONN_BASE, { type: "welcome", resumeToken: "abc" });
    await new Promise((r) => setTimeout(r, 50));

    await client.connect(`127.0.0.1:${port}`);
    client.send(hello);
    await until(() => received.length === 2);
    expect(received[1]).toEqual({ ...hello, resumeToken: "abc" });

    client.send({ ...hello, save: { name: "Other" } });
    await until(() => received.length === 3);
    expect(received[2]).toEqual({ ...hello, save: { name: "Other" } });
  });
});
