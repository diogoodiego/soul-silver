import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { ServerMessage } from "@soulsilver/shared/game";
import { newBoxes, newCollection, newProgress, type PartyMember, type Save } from "@soulsilver/shared/save";
import { createSession, type Connection } from "@soulsilver/server";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createWsListener, rawText, type WsListener } from "../src/server-host/ws-listener";

// Spec 028.3: the atomic trade over a real WebSocket on localhost, with the socket killed in each phase.

const mon = (species: number): PartyMember => ({ species, level: 5, moves: [33], hp: 20, friendship: 70, experience: 125, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });
const START = {
  Gold: { party: [mon(155), mon(16)], bag: [{ item: 17, count: 5 }] },
  Silver: { party: [mon(158), mon(19)], bag: [{ item: 4, count: 3 }] },
};
type Name = keyof typeof START;
const PHASES = ["proposal", "confirmation", "final", "saving"] as const;

function ledger(saves: Pick<Save, "party" | "bag">[]) {
  const species = saves.flatMap((s) => s.party.map((m) => m.species)).sort((a, b) => a - b);
  const items: Record<number, number> = {};
  for (const s of saves) for (const b of s.bag) items[b.item] = (items[b.item] ?? 0) + b.count;
  return { species, items };
}
const BEFORE = ledger(Object.values(START));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let listener: WsListener | undefined;
const sockets: WebSocket[] = [];
afterEach(() => {
  for (const s of sockets.splice(0)) s.terminate();
  listener?.stop();
  listener = undefined;
});

async function game() {
  const session = createSession({ seed: 1, world: () => undefined, log: () => undefined, clock: () => "2026-11-13T12:00:00.000Z", newToken: (() => { let n = 0; return () => `token-${++n}`; })() });
  // One Connection per WebSocket, as the app's server host does through the game server.
  const conns = new Map<number, { message: ((m: unknown) => void)[]; close: (() => void)[] }>();
  listener = createWsListener({
    ports: [0],
    onMessage(connId, msg) {
      let c = conns.get(connId);
      if (!c) {
        const fresh = { message: [] as ((m: unknown) => void)[], close: [] as (() => void)[] };
        conns.set(connId, (c = fresh));
        const conn: Connection = {
          send: (m) => listener?.send(connId, m),
          onMessage: (l) => void fresh.message.push(l),
          onClose: (l) => void fresh.close.push(l),
          close: () => listener?.close(connId),
        };
        session.connect(conn);
      }
      for (const l of c.message) l(msg);
    },
    onClose: (connId) => conns.get(connId)?.close.forEach((l) => l()),
    log: () => undefined,
  });
  const port = await listener.start();

  const disk: Record<Name, Pick<Save, "party" | "bag" | "rev">> = { Gold: { ...START.Gold, rev: 0 }, Silver: { ...START.Silver, rev: 0 } };
  const got: Record<Name, ServerMessage[]> = { Gold: [], Silver: [] };
  const ws = {} as Record<Name, WebSocket>;
  const tokens = {} as Record<Name, string>;
  /** false: this app dies before writing the saves it gets. */
  const writes: Record<Name, boolean> = { Gold: true, Silver: true };
  /** Steps the session until `done`, letting the sockets deliver between ticks. */
  async function until(done: () => boolean, ticks = 200) {
    for (let i = 0; i < ticks && !done(); i++) {
      session.step();
      await sleep(2);
    }
    expect(done()).toBe(true);
  }
  async function join(name: Name, resumeToken?: string) {
    const s = new WebSocket(`ws://127.0.0.1:${port}`);
    sockets.push(s);
    await new Promise((resolve, reject) => (s.once("open", resolve), s.once("error", reject)));
    got[name] = [];
    s.on("message", (d) => {
      const m = JSON.parse(rawText(d)) as ServerMessage;
      got[name].push(m);
      if (m.type === "welcome") tokens[name] = m.resumeToken;
      if (m.type === "save" && ws[name] === s && writes[name]) {
        disk[name] = m.save;
        s.send(JSON.stringify({ type: "save-ack", rev: m.save.rev }));
      }
    });
    ws[name] = s;
    const save: Save = { schemaVersion: 15, rivalName: "", storyRev: 1, boxes: newBoxes(), pcItems: [], pending: [], flags: [], vars: {}, npcPlacement: {}, name, character: "male", area: "a", x: 160, y: 160, facing: "south", playTimeMs: 0, savedAt: "2026-11-13T12:00:00.000Z", ...newProgress(), ...newCollection(), ...disk[name], party: disk[name].party.map((m) => ({ ...m })), bag: disk[name].bag.map((b) => ({ ...b })) };
    s.send(JSON.stringify({ type: "hello", protocolVersion: PROTOCOL_VERSION, save, ...(resumeToken ? { resumeToken } : {}) }));
    await until(() => got[name].some((m) => m.type === "welcome"));
  }
  const ids = {} as Record<Name, number>;
  const phase = (name: Name) => got[name].filter((m): m is Extract<ServerMessage, { type: "tradeState" }> => m.type === "tradeState").at(-1)?.phase;
  const send = (name: Name, msg: unknown) => ws[name].send(JSON.stringify(msg));
  async function step(name: Name, msg: unknown, expectPhase: (typeof phase extends (n: Name) => infer P ? P : never)) {
    const before = got[name === "Gold" ? "Silver" : "Gold"].length;
    send(name, msg);
    await until(() => got[name === "Gold" ? "Silver" : "Gold"].length > before && phase("Gold") === expectPhase);
  }
  await join("Gold");
  await join("Silver");
  for (const name of ["Gold", "Silver"] as const) ids[name] = got[name].find((m): m is Extract<ServerMessage, { type: "welcome" }> => m.type === "welcome")!.playerId;

  async function reach(until_: (typeof PHASES)[number] | "done") {
    await step("Gold", { type: "trade-propose", to: ids.Silver }, "waiting");
    if (until_ === "proposal") return;
    await step("Silver", { type: "trade-answer", accept: true }, "open");
    await step("Gold", { type: "trade-offer", offer: { party: [0], items: [{ item: 17, count: 2 }] } }, "open");
    await step("Silver", { type: "trade-offer", offer: { party: [1], items: [{ item: 4, count: 1 }] } }, "open");
    await step("Gold", { type: "trade-confirm" }, "open");
    if (until_ === "confirmation") return;
    await step("Silver", { type: "trade-confirm" }, "final");
    await step("Gold", { type: "trade-confirm" }, "final");
    if (until_ === "final") return;
    if (until_ === "saving") {
      // Silver's app dies after the trade is applied, before it writes the save: that save never reaches its disk.
      writes.Silver = false;
      send("Silver", { type: "trade-confirm" });
      await until(() => phase("Gold") === "done");
      ws.Silver.terminate();
      writes.Silver = true;
      return;
    }
    await step("Silver", { type: "trade-confirm" }, "done");
    await until(() => disk.Silver.rev > 0 && disk.Gold.rev > 0);
  }
  /** The socket dies without a goodbye. */
  async function kill(name: Name) {
    ws[name].terminate();
    await until(() => name === "Silver" ? phase("Gold") !== "open" && phase("Gold") !== "final" && phase("Gold") !== "waiting" : true);
  }
  return { session, disk, tokens, phase, reach, kill, join, until };
}

describe("atomic trade over a real WebSocket (spec 028.3)", () => {
  it("a trade with no drop swaps the offers on both saves, once", async () => {
    const g = await game();
    await g.reach("done");
    expect(g.disk.Gold.party.map((m) => m.species)).toEqual([16, 19]);
    expect(g.disk.Silver.party.map((m) => m.species)).toEqual([158, 155]);
    expect(ledger(Object.values(g.disk))).toEqual(BEFORE);
  });

  it.each(PHASES.filter((p) => p !== "saving"))("a socket killed at the %s leaves both saves as they were", async (phase) => {
    const g = await game();
    await g.reach(phase);
    await g.kill("Silver");
    expect(g.phase("Gold")).toBe("cancelled");
    await g.join("Silver", g.tokens.Silver);
    expect(g.disk.Gold.party.map((m) => m.species)).toEqual([155, 16]);
    expect(g.disk.Silver.party.map((m) => m.species)).toEqual([158, 19]);
    expect(ledger(Object.values(g.disk))).toEqual(BEFORE);
  });

  it.each([true, false])("a socket killed while saving: back (with the token: %s), the player gets the trade, with no loss or copy", async (withToken) => {
    const g = await game();
    await g.reach("saving");
    expect(g.disk.Silver.party.map((m) => m.species)).toEqual([158, 19]);
    await g.join("Silver", withToken ? g.tokens.Silver : undefined);
    await g.until(() => g.disk.Silver.party.map((m) => m.species).join() === "158,155");
    expect(ledger(Object.values(g.disk))).toEqual(BEFORE);
  });
});
