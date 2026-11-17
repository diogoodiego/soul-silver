import { describe, expect, it } from "vitest";
import { createPeerRemote, type PeerPort } from "../src/main/peer-remote";

// R.3: the guest's link to the host through the renderer's WebRTC data channel, carried by a MessagePort.

function fakePort() {
  const posted: unknown[] = [];
  const handlers: { message: ((e: { data: unknown }) => void)[]; close: (() => void)[] } = { message: [], close: [] };
  let closed = false;
  const port: PeerPort = {
    postMessage: (data) => posted.push(data),
    on: ((event: "message" | "close", l: never) => handlers[event].push(l)),
    start: () => {},
    close: () => {
      closed = true;
    },
  };
  return {
    port,
    posted,
    deliver: (msg: unknown) => handlers.message.forEach((l) => l({ data: JSON.stringify(msg) })),
    deliverRaw: (text: string) => handlers.message.forEach((l) => l({ data: text })),
    hangUp: () => handlers.close.forEach((l) => l()),
    isClosed: () => closed,
  };
}

function setup() {
  const got: unknown[] = [];
  let closes = 0;
  const remote = createPeerRemote({ onMessage: (m) => got.push(m), onClose: () => closes++, log: () => {} });
  return { remote, got, closes: () => closes };
}

describe("peer remote", () => {
  it("refuses to connect before the renderer handed over a link", async () => {
    const { remote } = setup();
    await expect(remote.connect()).rejects.toThrow(/convite/);
  });

  it("relays both ways as JSON text and adds the room password to the hello", async () => {
    const { remote, got } = setup();
    const p = fakePort();
    remote.attach(p.port);
    await remote.connect("convite", "pikachu");
    remote.send({ type: "hello", protocolVersion: 35, save: { name: "Gold" } });
    remote.send({ type: "leave" });
    expect(p.posted.map((t) => JSON.parse(t as string) as unknown)).toEqual([{ type: "hello", protocolVersion: 35, save: { name: "Gold" }, roomPassword: "pikachu" }, { type: "leave" }]);
    p.deliver({ type: "welcome" });
    expect(got).toEqual([{ type: "welcome" }]);
    expect(remote.connected).toBe(true);
  });

  it("reports the link closing and cannot connect again on the same one", async () => {
    const { remote, closes } = setup();
    const p = fakePort();
    remote.attach(p.port);
    await remote.connect();
    p.hangUp();
    expect(closes()).toBe(1);
    expect(remote.connected).toBe(false);
    await expect(remote.connect()).rejects.toThrow();
  });

  it("treats null from the renderer as the channel closing", async () => {
    const { remote, closes } = setup();
    const p = fakePort();
    remote.attach(p.port);
    await remote.connect();
    p.deliverRaw(null as unknown as string);
    expect(closes()).toBe(1);
    expect(p.isClosed()).toBe(true);
  });

  it("closes the port when closed from this side, telling the renderer, without reporting it", async () => {
    const { remote, closes } = setup();
    const p = fakePort();
    remote.attach(p.port);
    await remote.connect();
    remote.close();
    expect(p.posted.at(-1)).toBeNull();
    expect(p.isClosed()).toBe(true);
    expect(closes()).toBe(0);
  });

  it("ignores text that is not JSON", async () => {
    const { remote, got } = setup();
    const p = fakePort();
    remote.attach(p.port);
    await remote.connect();
    p.deliverRaw("not json");
    p.deliver({ type: "welcome" });
    expect(got).toEqual([{ type: "welcome" }]);
  });
});
