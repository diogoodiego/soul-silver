import type { ServerMessage } from "@soulsilver/shared/game";
import type { PartyMember, Save } from "@soulsilver/shared/save";
import { describe, expect, it } from "vitest";
import { setup } from "./harness";

// Spec 028.3: the trade applied in one step on the server and saved on both sides, with a connection drop
// injected in each phase (proposal, confirmation, final confirmation, saving). In memory, through the harness.

const mon = (species: number): PartyMember => ({ species, level: 5, moves: [33], hp: 20, friendship: 70, experience: 125, ivs: { hp: 1, attack: 1, defense: 1, speed: 1, specialAttack: 1, specialDefense: 1 }, evs: { hp: 0, attack: 0, defense: 0, speed: 0, specialAttack: 0, specialDefense: 0 }, nature: 0 });
const START = {
  Gold: { party: [mon(155), mon(16)], bag: [{ item: 17, count: 5 }] },
  Silver: { party: [mon(158), mon(19)], bag: [{ item: 4, count: 3 }] },
};
type Name = keyof typeof START;
type Client = ReturnType<ReturnType<typeof setup>["connect"]>;
const PHASES = ["proposal", "confirmation", "final", "saving"] as const;

/** Every Pokémon (by species) and every item count the two saves hold together. */
function ledger(saves: Pick<Save, "party" | "bag">[]) {
  const species = saves.flatMap((s) => s.party.map((m) => m.species)).sort((a, b) => a - b);
  const items: Record<number, number> = {};
  for (const s of saves) for (const b of s.bag) items[b.item] = (items[b.item] ?? 0) + b.count;
  return { species, items };
}
const BEFORE = ledger(Object.values(START));

type Disk = Record<Name, Pick<Save, "party" | "bag" | "rev">>;
const freshDisk = (): Disk => ({ Gold: { ...START.Gold, rev: 0 }, Silver: { ...START.Silver, rev: 0 } });

/** The host's book of trades not yet saved on a client, kept across sessions (in the app, a file). */
function memoryLedger() {
  const book = new Map<string, Save>();
  return { book, get: (name: string) => book.get(name), put: (name: string, save: Save) => void book.set(name, save), remove: (name: string) => void book.delete(name) };
}

/** `disk`: what each player has on disk, the saves they acknowledged; shared when a game follows another. */
function game(disk: Disk = freshDisk(), tradeLedger?: ReturnType<typeof memoryLedger>) {
  const t = setup({ spawn: () => ({ area: "a", x: 160, y: 160 }), ...(tradeLedger ? { tradeLedger } : {}) });
  const clients = {} as Record<Name, Client>;
  /** `write`: whether this client writes the saves it gets (false: it drops before writing). */
  const write: Record<Name, boolean> = { Gold: true, Silver: true };
  function join(name: Name, resumeToken?: string) {
    const c = t.connect(name, undefined, { save: { ...disk[name], party: disk[name].party.map((m) => ({ ...m })), bag: disk[name].bag.map((b) => ({ ...b })) }, ...(resumeToken ? { resumeToken } : {}) });
    const onSave = (msg: ServerMessage) => {
      if (msg.type !== "save" || !write[name]) return;
      disk[name] = msg.save;
      c.conn.send({ type: "save-ack", rev: msg.save.rev });
    };
    // Saves sent while joining arrived before this listener.
    for (const m of [...c.got]) onSave(m);
    c.conn.onMessage((m) => onSave(m as ServerMessage));
    clients[name] = c;
    return c;
  }
  join("Gold");
  join("Silver");
  const send = (name: Name, msg: unknown) => {
    clients[name].conn.send(msg);
    t.session.step();
  };
  const id = (name: Name) => clients[name].welcome!.playerId;
  const phase = (name: Name) => clients[name].got.filter((m): m is Extract<ServerMessage, { type: "tradeState" }> => m.type === "tradeState").at(-1)?.phase;
  /** Gold offers the Cyndaquil and 2 Potions for Silver's Pidgey... Silver's Rattata and a Poké Ball. */
  function reach(until: (typeof PHASES)[number] | "done") {
    send("Gold", { type: "trade-propose", to: id("Silver") });
    if (until === "proposal") return;
    send("Silver", { type: "trade-answer", accept: true });
    send("Gold", { type: "trade-offer", offer: { party: [0], items: [{ item: 17, count: 2 }] } });
    send("Silver", { type: "trade-offer", offer: { party: [1], items: [{ item: 4, count: 1 }] } });
    send("Gold", { type: "trade-confirm" });
    if (until === "confirmation") return;
    send("Silver", { type: "trade-confirm" });
    send("Gold", { type: "trade-confirm" });
    if (until === "final") return;
    // Silver's app drops while saving: the save the trade sent never reaches its disk.
    if (until === "saving") write.Silver = false;
    send("Silver", { type: "trade-confirm" });
  }
  /** The connection drops: the client goes away with what is on its disk. */
  function drop(name: Name) {
    clients[name].conn.close();
    t.session.step();
    write[name] = true;
  }
  return { ...t, disk, clients, join, send, id, phase, reach, drop };
}

describe("atomic trade (spec 028.3)", () => {
  it("a trade with no drop swaps the offers on both saves, once", () => {
    const g = game();
    g.reach("done");
    expect([g.phase("Gold"), g.phase("Silver")]).toEqual(["done", "done"]);
    expect(g.disk.Gold.party.map((m) => m.species)).toEqual([16, 19]);
    expect(g.disk.Silver.party.map((m) => m.species)).toEqual([158, 155]);
    expect(g.disk.Gold.bag).toEqual([{ item: 17, count: 3 }, { item: 4, count: 1 }]);
    expect(g.disk.Silver.bag).toEqual([{ item: 4, count: 2 }, { item: 17, count: 2 }]);
    expect(ledger(Object.values(g.disk))).toEqual(BEFORE);
  });

  it.each(PHASES.filter((p) => p !== "saving"))("a drop at the %s leaves both saves as they were", (phase) => {
    const g = game();
    g.reach(phase);
    g.drop("Silver");
    expect(g.phase("Gold")).toBe("cancelled");
    g.join("Silver", g.clients.Silver.welcome!.resumeToken);
    g.session.step();
    expect(g.disk.Gold.party.map((m) => m.species)).toEqual([155, 16]);
    expect(g.disk.Silver.party.map((m) => m.species)).toEqual([158, 19]);
    expect(ledger(Object.values(g.disk))).toEqual(BEFORE);
  });

  it("a drop while saving: the partner keeps the trade and the dropped player gets it back on resuming", () => {
    const g = game();
    g.reach("saving");
    g.drop("Silver");
    expect(g.disk.Silver.party.map((m) => m.species)).toEqual([158, 19]);
    g.join("Silver", g.clients.Silver.welcome!.resumeToken);
    g.session.step();
    expect(g.disk.Silver.party.map((m) => m.species)).toEqual([158, 155]);
    expect(ledger(Object.values(g.disk))).toEqual(BEFORE);
  });

  it("a drop while saving: back without the resume token and after the seat would expire, the old save is not taken", () => {
    const g = game();
    g.reach("saving");
    g.drop("Silver");
    // Gold stays (as the host, its silence would close the session) while Silver's seat would have expired.
    for (let i = 0; i < 3000; i++) {
      g.clients.Gold.input(i + 1, null);
      g.session.step();
    }
    g.join("Silver");
    g.session.step();
    expect(g.clients.Silver.welcome).toBeDefined();
    expect(g.disk.Silver.party.map((m) => m.species)).toEqual([158, 155]);
    expect(ledger(Object.values(g.disk))).toEqual(BEFORE);
  });

  it("a drop while saving, then the host closes: in the host's next game the old save is not taken", () => {
    const book = memoryLedger();
    const first = game(freshDisk(), book);
    first.reach("saving");
    first.drop("Silver");
    first.session.close("closed-by-host");
    expect(first.disk.Silver.party.map((m) => m.species)).toEqual([158, 19]);
    expect([...book.book.keys()]).toEqual(["Silver"]);
    // Next day, same host: both come back with what is on their disks.
    const next = game(first.disk, book);
    next.session.step();
    expect(next.disk.Silver.party.map((m) => m.species)).toEqual([158, 155]);
    expect(ledger(Object.values(next.disk))).toEqual(BEFORE);
    expect(book.book.size).toBe(0);
  });

  it("the book forgets a trade once the client acknowledges its save", () => {
    const book = memoryLedger();
    const g = game(freshDisk(), book);
    g.reach("done");
    expect(book.book.size).toBe(0);
  });

  it("a trade the commit refuses (Gold would be left without a Pokémon) is cancelled and changes nothing", () => {
    const g = game();
    g.send("Gold", { type: "trade-propose", to: g.id("Silver") });
    g.send("Silver", { type: "trade-answer", accept: true });
    g.send("Gold", { type: "trade-offer", offer: { party: [0, 1], items: [] } });
    for (const name of ["Gold", "Silver", "Gold", "Silver"] as const) g.send(name, { type: "trade-confirm" });
    expect([g.phase("Gold"), g.phase("Silver")]).toEqual(["cancelled", "cancelled"]);
    expect(g.disk.Gold.party.map((m) => m.species)).toEqual([155, 16]);
    expect(ledger(Object.values(g.disk))).toEqual(BEFORE);
  });
});
