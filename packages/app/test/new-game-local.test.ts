import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { findDuplicates, type ServerMessage } from "@soulsilver/shared/game";
import { applyNewGame, migrate, type Save } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { loadWorld } from "../src/server-host/world-loader";
import { describe, expect, it } from "vitest";
import { readNewGameStart } from "../src/server-host/extracted";
import { loadScripts } from "../src/server-host/scripts-loader";

// Spec 024 US1 against the local extraction (never committed, principle II); skipped without one.
// Override the folder with SOULSILVER_STAGES. Groundwork for the golden path's first milestone.

const stages = process.env["SOULSILVER_STAGES"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");

describe.skipIf(!existsSync(join(stages, "events", "events", "new-game.json")))("new game (local extraction)", () => {
  const world = loadWorld(stages, () => undefined);
  const scripts = loadScripts(stages, () => undefined)!;
  const start = readNewGameStart(stages, () => undefined)!;

  /** A save as the app creates it, optionally moved to another tile (area-local). */
  function created(at?: { area: string; tx: number; ty: number }): Save {
    const base = migrate({ schemaVersion: 1, name: "Gold", character: "male", area: "0", x: 0, y: 0, facing: "south", playTimeMs: 0, savedAt: "2026-10-28T12:00:00.000Z", rev: 0 });
    if (!base.ok) throw new Error(base.message);
    const save = applyNewGame(base.save, start);
    return at ? { ...save, area: at.area, x: at.tx * 16 + 8, y: at.ty * 16 + 8 } : save;
  }

  function play(save: Save, ticks: number) {
    const session = createSession({ seed: 1, world, scripts, log: () => undefined, clock: () => "2026-10-28T12:00:00.000Z", newToken: () => "t" });
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    client.onMessage((m) => got.push(m as ServerMessage));
    session.connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save });
    for (let i = 0; i < ticks; i++) session.step();
    const people = new Map<number, number>();
    for (const m of got) {
      if (m.type !== "state") continue;
      for (const e of m.spawned) if (e.kind === "npc") people.set(e.id, e.data["person"] as number);
      for (const id of m.removed) people.delete(id);
    }
    client.send({ type: "leave" });
    const saves = got.filter((m) => m.type === "save");
    return { got, people: [...people.values()].sort((a, b) => a - b), save: saves.at(-1)?.type === "save" ? saves.at(-1)!.save : undefined };
  }

  /** Plays a scene to its end, answering what it asks as a client would. */
  function scene(save: Save, text = "") {
    const logs: string[] = [];
    const session = createSession({ seed: 1, world, scripts, log: (m) => logs.push(m), clock: () => "2026-10-28T12:00:00.000Z", newToken: () => "t" });
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    let answered = 0;
    client.onMessage((m) => got.push(m as ServerMessage));
    session.connect(server);
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save });
    for (let i = 0; i < 4000; i++) {
      session.step();
      const asks = got.filter((m) => m.type === "script");
      for (const ask of asks.slice(answered)) client.send({ type: "script-answer", id: ask.id, answer: 0, ...(ask.request.kind === "name" ? { text } : {}) });
      answered = asks.length;
    }
    const locks = got.filter((m) => m.type === "script-lock");
    client.send({ type: "leave" });
    const saves = got.filter((m) => m.type === "save");
    type Shown = Extract<ServerMessage, { type: "script-event" }>["event"] | { kind: "unlocked" };
    const events = got.flatMap((m): Shown[] => (m.type === "script-event" ? [m.event] : m.type === "script-lock" && !m.locked ? [{ kind: "unlocked" }] : []));
    return { got, logs, events, locked: locks.at(-1)?.locked, save: saves.at(-1)?.type === "save" ? saves.at(-1)!.save : undefined };
  }
  const playing = (at: { area: string; tx: number; ty: number }, vars: Record<string, number>) => ({ ...created(at), vars, rev: 1, playTimeMs: 1000 });
  const music = (events: ReturnType<typeof scene>["events"]) => events.filter((e) => e.kind === "bgm" || e.kind === "bgm-reset" || e.kind === "unlocked");
  const missing = (logs: string[]) => logs.filter((l) => l.includes("missing"));

  it("names the rival in Elm's lab and goes on (843:2)", () => {
    const typed = scene(playing({ area: "61", tx: 7, ty: 7 }, { [0x4108]: 3 }), "Blue");
    expect(missing(typed.logs)).toEqual([]);
    expect(typed.locked).toBe(false);
    expect(typed.save?.rivalName).toBe("Blue");
    expect(typed.got.some((m) => m.type === "script" && m.request.kind === "say" && m.request.buffers[1]?.kind === "rival" && m.request.buffers[1].name === "Blue")).toBe(true);
    expect(typed.got.filter((m) => m.type === "script" && m.request.kind === "name")).toHaveLength(1);
    expect(scene(playing({ area: "61", tx: 7, ty: 7 }, { [0x4108]: 3 })).save?.rivalName).toBe("Heart");
  });

  it("gives the map's music back after Mom's scene", () => {
    const { events, logs, save } = scene(playing({ area: "63", tx: 3, ty: 4 }, {}));
    expect(missing(logs)).toEqual([]);
    expect(save?.vars[String(0x4106)]).toBe(1);
    const list = music(events);
    expect(list).toContainEqual({ kind: "bgm", id: 1086 });
    expect(list.slice(-2)).toEqual([{ kind: "bgm-reset" }, { kind: "unlocked" }]);
  });

  it("ends the script after the healing music stop (229:35)", () => {
    const { events, locked } = scene(playing({ area: "143", tx: 4, ty: 9 }, {}));
    const list = music(events);
    expect(locked).toBe(false);
    expect(list).toContainEqual({ kind: "bgm", id: null });
    expect(list.at(-1)).toEqual({ kind: "unlocked" });
  });

  it("starts in the player's room, with the original's init flags set", () => {
    expect(start).toEqual({ map: 64, tx: 6, ty: 6, facing: "south" });
    expect(world("64")!.origin).toEqual({ tx: 0, ty: 0 });
    const { save } = play(created(), 3);
    expect(save).toMatchObject({ area: "64", storyRev: 1, party: [] });
    for (const flag of [418, 678, 744, 960]) expect(save!.flags).toContain(flag);
  });

  it("downstairs, Mom's scene starts on its own (0x4106 = 0)", () => {
    const { got } = play(created({ area: "63", tx: 3, ty: 4 }), 6);
    expect(got.some((m) => m.type === "script-lock" && m.locked)).toBe(true);
  });

  it("New Bark Town shows neither Mom nor the friend's later versions", () => {
    const events = scripts.events(60)!;
    const hidden = events.npcs.filter((n) => [418, 678, 744].includes(n.hideFlag)).map((n) => n.id);
    expect(hidden.length).toBeGreaterThan(0);
    const { people } = play(created({ area: "60", tx: 23, ty: 13 }), 3);
    for (const id of hidden) expect(people).not.toContain(id);
  });

  it("shows each character once in New Bark Town and the house", () => {
    for (const [area, tx, ty] of [["60", 23, 13], ["63", 3, 4], ["64", 6, 6]] as const) {
      const { people } = play(created({ area, tx, ty }), 3);
      // The init script hides all three objects of the bedroom (64).
      expect(people.length > 0, area).toBe(area !== "64");
      expect(findDuplicates(scripts.events(Number(area))!.npcs, (o) => people.includes(o.id)), area).toEqual([]);
    }
  });
});
