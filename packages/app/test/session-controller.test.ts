import { newBoxes, newItemState, type Save, type SaveResult } from "@soulsilver/shared/save";
import type { SessionListing } from "@soulsilver/shared/lan";
import { describe, expect, it, vi } from "vitest";
import { createSessionController } from "../src/main/session-controller";
import type { HostAnnouncement } from "../src/main/discovery";

const save: Save = { schemaVersion: 11, rivalName: "", storyRev: 1, pending: [], flags: [], vars: {}, npcPlacement: {}, name: "Gold", character: "male", area: "60", x: 1, y: 2, facing: "south", playTimeMs: 0, savedAt: "2026-10-24T12:00:00.000Z", rev: 0, party: [], money: 3000, badgeSet: 0, flyPoints: [], respawn: null, bag: [], pokedex: { seen: [], caught: [] }, boxes: newBoxes(), pcItems: [], phone: { contacts: [], seeking: [], called: [], pending: [], log: [] }, ...newItemState() };

function setup(options: { load?: () => Promise<{ ok: true; save: Save } | { ok: false; reason: string }>; listen?: () => Promise<number>; connect?: () => Promise<void>; shutdownWaitMs?: number } = {}) {
  const events: string[] = [];
  const toRenderer: unknown[] = [];
  const written: Save[] = [];
  const sent: unknown[] = [];
  const remoteSent: unknown[] = [];
  const announced: HostAnnouncement[] = [];
  const stopAnnounce = vi.fn();
  const stopWatch = vi.fn();
  let sessions: ((l: SessionListing[]) => void) | undefined;
  const saved: SaveResult[] = [];
  const controller = createSessionController({
    saves: {
      load: options.load ?? (() => Promise.resolve({ ok: true, save })),
      write: (_slot, s) => {
        written.push(s);
        return Promise.resolve({ ok: true });
      },
    },
    server: {
      connectGame: () => events.push("connect"),
      sendGame: (m) => sent.push(m),
      listen: options.listen ?? (() => Promise.resolve(47800)),
      unlisten: () => events.push("unlisten"),
      getInfo: () => Promise.resolve({ players: 3 } as never),
    },
    remote: {
      connect: options.connect ?? (() => Promise.resolve()),
      send: (m) => remoteSent.push(m),
      close: () => events.push("remote-close"),
    },
    discovery: {
      announce: (h) => {
        announced.push(h);
        return stopAnnounce;
      },
      watch: (l) => {
        sessions = l;
        return stopWatch;
      },
    },
    protocolVersion: 4,
    newSessionId: () => "sid",
    emit: {
      gameMessage: (m) => toRenderer.push(m),
      gameClosed: () => events.push("closed"),
      saved: (r) => saved.push(r),
      sessions: () => events.push("sessions"),
    },
    ...(options.shutdownWaitMs ? { shutdownWaitMs: options.shutdownWaitMs } : {}),
    log: () => {},
  });
  return { controller, events, toRenderer, written, sent, remoteSent, announced, stopAnnounce, stopWatch, saved, sessions: () => sessions };
}

describe("solo", () => {
  it("connects locally and returns the save, without listening or announcing", async () => {
    const { controller, events, announced } = setup();
    expect(await controller.startSolo(1)).toEqual({ ok: true, save });
    expect(events).toEqual(["connect"]);
    expect(announced).toEqual([]);
  });

  it("fails with the reason when the save cannot load", async () => {
    const { controller, events } = setup({ load: () => Promise.resolve({ ok: false, reason: "arquivo ilegível" }) });
    expect(await controller.startSolo(1)).toEqual({ ok: false, reason: "arquivo ilegível" });
    expect(events).toEqual([]);
  });
});

describe("saves from the server", () => {
  it("writes the save, acks it on the current transport and still forwards it", async () => {
    const { controller, written, sent, toRenderer, saved } = setup();
    await controller.startSolo(2);
    controller.onServerMessage({ type: "save", save: { ...save, rev: 4 } });
    await vi.waitFor(() => expect(sent).toEqual([{ type: "save-ack", rev: 4 }]));
    expect(written).toEqual([{ ...save, rev: 4 }]);
    expect(saved).toEqual([{ ok: true }]);
    expect(toRenderer).toHaveLength(1);
  });

  it("ignores a malformed save", async () => {
    const { controller, written, sent } = setup();
    await controller.startSolo(1);
    controller.onServerMessage({ type: "save", save: { name: "" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(written).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe("host", () => {
  it("listens, connects, announces with the live player count and stops with the session", async () => {
    const { controller, events, announced, stopAnnounce } = setup();
    expect(await controller.startHost(1)).toEqual({ ok: true, save });
    expect(events).toEqual(["connect"]);
    expect(announced[0]).toMatchObject({ sessionId: "sid", hostName: "Gold", port: 47800, maxPlayers: 4, protocolVersion: 4 });
    expect(await announced[0]!.players()).toBe(3);
    controller.onServerClosed();
    expect(stopAnnounce).toHaveBeenCalled();
    expect(events).toEqual(["connect", "unlisten", "closed"]);
  });

  it("returns the port failure and does not connect", async () => {
    const { controller, events, announced } = setup({ listen: () => Promise.reject(new Error("Não foi possível abrir a porta de rede")) });
    expect(await controller.startHost(1)).toEqual({ ok: false, reason: "Não foi possível abrir a porta de rede" });
    expect(events).toEqual([]);
    expect(announced).toEqual([]);
  });
});

describe("open to LAN", () => {
  it("listens and announces the solo session without connecting again, and stops with it", async () => {
    const { controller, events, announced, stopAnnounce } = setup();
    await controller.startSolo(1);
    expect(await controller.openToLan()).toEqual({ ok: true, port: 47800 });
    expect(announced[0]).toMatchObject({ hostName: "Gold", port: 47800 });
    expect(await controller.openToLan()).toMatchObject({ ok: false });
    controller.onServerClosed();
    expect(stopAnnounce).toHaveBeenCalled();
    expect(events).toEqual(["connect", "unlisten", "closed"]);
  });

  it("refuses without a solo session, and returns the port failure", async () => {
    expect(await setup().controller.openToLan()).toMatchObject({ ok: false });
    const { controller, announced } = setup({ listen: () => Promise.reject(new Error("porta ocupada")) });
    await controller.startSolo(1);
    expect(await controller.openToLan()).toEqual({ ok: false, reason: "porta ocupada" });
    expect(announced).toEqual([]);
  });
});

describe("guest", () => {
  it("sends through the socket and ends when it closes", async () => {
    const { controller, events, sent, remoteSent } = setup();
    expect(await controller.joinSession(1, "10.0.0.2")).toEqual({ ok: true, save });
    controller.sendGame({ type: "input" });
    expect(remoteSent).toEqual([{ type: "input" }]);
    expect(sent).toEqual([]);
    controller.onServerClosed();
    expect(events).toEqual([]);
    controller.onRemoteClosed();
    expect(events).toEqual(["remote-close", "closed"]);
  });

  it("returns the connection failure", async () => {
    const { controller } = setup({ connect: () => Promise.reject(new Error("ninguém está hospedando nesse endereço")) });
    expect(await controller.joinSession(1, "10.0.0.2")).toEqual({ ok: false, reason: "ninguém está hospedando nesse endereço" });
  });
});

describe("sessions list and shutdown", () => {
  it("watches while asked to and stops", () => {
    const { controller, stopWatch, sessions } = setup();
    controller.watchSessions(true);
    expect(sessions()).toBeDefined();
    controller.watchSessions(false);
    expect(stopWatch).toHaveBeenCalled();
  });

  it("shutdown leaves and waits for the session to close", async () => {
    const { controller, sent } = setup();
    await controller.startSolo(1);
    let done = false;
    const shutdown = controller.shutdown().then(() => (done = true));
    expect(sent).toEqual([{ type: "leave" }]);
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    controller.onServerClosed();
    await shutdown;
    expect(done).toBe(true);
  });

  it("shutdown gives up after the wait", async () => {
    const { controller } = setup({ shutdownWaitMs: 20 });
    await controller.startSolo(1);
    await controller.shutdown();
  });

  it("shutdown without a session returns at once", async () => {
    await setup().controller.shutdown();
  });
});
