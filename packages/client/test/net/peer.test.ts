import { encodeInvite } from "@soulsilver/shared/lan";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerInvite, bridge, GATHER_MS, INVITE_MS, inviteGuest, OPEN_MS, type PeerFactory } from "../../src/net/peer";

// R.3: the invite's life on both sides, with a fake WebRTC (vitest has none).

class FakeChannel {
  readyState = "connecting";
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = "closed";
    this.onclose?.();
  }
  open() {
    this.readyState = "open";
    this.onopen?.();
  }
}

class FakePc {
  static all: FakePc[] = [];
  iceGatheringState = "new";
  localDescription: { type: string; sdp: string } | null = null;
  remote: { type: string; sdp: string } | null = null;
  channel = new FakeChannel();
  closed = false;
  onicegatheringstatechange: (() => void) | null = null;
  ondatachannel: ((e: { channel: FakeChannel }) => void) | null = null;
  config: unknown;
  constructor(config: unknown) {
    this.config = config;
    FakePc.all.push(this);
  }
  createDataChannel() {
    return this.channel;
  }
  createOffer() {
    return Promise.resolve({ type: "offer", sdp: "v=0\r\noffer\r\n" });
  }
  createAnswer() {
    return Promise.resolve({ type: "answer", sdp: "v=0\r\nanswer\r\n" });
  }
  setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = { ...d, sdp: `${d.sdp}a=candidate:gathered\r\n` };
    return Promise.resolve();
  }
  setRemoteDescription(d: { type: string; sdp: string }) {
    this.remote = d;
    return Promise.resolve();
  }
  close() {
    this.closed = true;
  }
  finishGathering() {
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.();
  }
}

const factory: PeerFactory = (config) => new FakePc(config) as unknown as RTCPeerConnection;
/** Lets the native compression streams and promise chains run (they use real setImmediate), until `done` when given. */
const flush = async (done?: () => boolean) => {
  for (let i = 0; done ? !done() && i < 5000 : i < 30; i++) await new Promise((r) => setImmediate(r));
};
const remoteSet = () => FakePc.all[0]?.remote != null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  FakePc.all = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("host invite", () => {
  it("waits for candidates, gives a code with them and opens when the answer comes", async () => {
    const pending = inviteGuest("stun:example.org:3478", factory);
    await flush();
    const pc = FakePc.all[0]!;
    expect(pc.config).toEqual({ iceServers: [{ urls: "stun:example.org:3478" }] });
    pc.finishGathering();
    const invite = await pending;
    const answer = await encodeInvite({ kind: "answer", sdp: "v=0\r\nfrom guest\r\n" });
    const opened = invite.accept(answer);
    await flush(remoteSet);
    expect(pc.remote).toEqual({ type: "answer", sdp: "v=0\r\nfrom guest\r\n" });
    pc.channel.open();
    expect(await opened).toBe(pc.channel);
    expect(invite.code.startsWith("SS1.")).toBe(true);
  });

  it("gives the code with what it has when gathering takes too long", async () => {
    const pending = inviteGuest("", factory);
    await flush();
    await vi.advanceTimersByTimeAsync(GATHER_MS);
    expect((await pending).code.startsWith("SS1.")).toBe(true);
    expect(FakePc.all[0]!.config).toEqual({ iceServers: [] });
  });

  it.each([
    ["is not a code", "hello", /inválido/],
    ["is another invite", "offer", /convite, não uma resposta/],
  ])("refuses an answer that %s", async (_label, kind, message) => {
    const pending = inviteGuest("", factory);
    FakePc.all[0]!.finishGathering();
    const invite = await pending;
    const code = kind === "offer" ? await encodeInvite({ kind: "offer", sdp: "v=0\r\n" }) : kind;
    await expect(invite.accept(code)).rejects.toThrow(message);
  });

  it("gives up when the channel does not open in time, closing the connection", async () => {
    const pending = inviteGuest("", factory);
    await flush();
    FakePc.all[0]!.finishGathering();
    const invite = await pending;
    const opened = invite.accept(await encodeInvite({ kind: "answer", sdp: "v=0\r\n" }));
    const check = expect(opened).rejects.toThrow(/não abriu/);
    await flush(remoteSet);
    await vi.advanceTimersByTimeAsync(OPEN_MS);
    await check;
    expect(FakePc.all[0]!.closed).toBe(true);
  });

  it("expires when no answer comes", async () => {
    const pending = inviteGuest("", factory);
    await flush();
    FakePc.all[0]!.finishGathering();
    const invite = await pending;
    await flush();
    await vi.advanceTimersByTimeAsync(INVITE_MS);
    expect(FakePc.all[0]!.closed).toBe(true);
    await expect(invite.accept(await encodeInvite({ kind: "answer", sdp: "v=0\r\n" }))).rejects.toThrow(/expirou/);
  });
});

describe("guest answer", () => {
  it("answers an invite and opens when the host's channel arrives", async () => {
    const pending = answerInvite(await encodeInvite({ kind: "offer", sdp: "v=0\r\nfrom host\r\n" }), "", factory);
    await flush(remoteSet);
    const pc = FakePc.all[0]!;
    expect(pc.remote).toEqual({ type: "offer", sdp: "v=0\r\nfrom host\r\n" });
    pc.finishGathering();
    const answer = await pending;
    expect(answer.code.startsWith("SS1.")).toBe(true);
    const channel = new FakeChannel();
    pc.ondatachannel?.({ channel });
    channel.open();
    expect(await answer.opened).toBe(channel);
  });

  it("refuses an answer code pasted as an invite", async () => {
    await expect(answerInvite(await encodeInvite({ kind: "answer", sdp: "v=0\r\n" }), "", factory)).rejects.toThrow(/resposta, não um convite/);
  });

  it("gives up after the invite's lifetime", async () => {
    const pending = answerInvite(await encodeInvite({ kind: "offer", sdp: "v=0\r\n" }), "", factory);
    await flush(remoteSet);
    FakePc.all[0]!.finishGathering();
    const answer = await pending;
    const check = expect(answer.opened).rejects.toThrow(/não abriu/);
    await flush();
    await vi.advanceTimersByTimeAsync(INVITE_MS);
    await check;
    expect(FakePc.all[0]!.closed).toBe(true);
  });
});

describe("bridge", () => {
  function fakePort() {
    const port = { posted: [] as unknown[], closed: false, onmessage: null as ((e: { data: unknown }) => void) | null, postMessage(d: unknown) { this.posted.push(d); }, close() { this.closed = true; } };
    return port;
  }

  it("carries text both ways and closes each side when the other goes", () => {
    const channel = new FakeChannel();
    channel.readyState = "open";
    const port = fakePort();
    const pc = new FakePc({});
    bridge(channel as unknown as RTCDataChannel, port as unknown as MessagePort, () => pc.close());
    channel.onmessage?.({ data: "to server" });
    port.onmessage?.({ data: "to guest" });
    expect(port.posted).toEqual(["to server"]);
    expect(channel.sent).toEqual(["to guest"]);
    channel.close();
    expect(port.posted.at(-1)).toBeNull();
    expect(port.closed).toBe(true);
    expect(pc.closed).toBe(true);
  });

  it("closes the channel when the other end of the port says so", () => {
    const channel = new FakeChannel();
    channel.readyState = "open";
    const port = fakePort();
    bridge(channel as unknown as RTCDataChannel, port as unknown as MessagePort, () => {});
    port.onmessage?.({ data: null });
    expect(channel.readyState).toBe("closed");
  });
});
