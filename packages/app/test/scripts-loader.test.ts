import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import { BUTTON, type ServerMessage } from "@soulsilver/shared/game";
import { newCollection, newProgress } from "@soulsilver/shared/save";
import { createRunner, SCRIPT_HANDLERS, type ScriptHost } from "@soulsilver/shared/script";
import { createMemoryConnectionPair, createSession, loadWorld } from "@soulsilver/server";
import { describe, expect, it } from "vitest";
import { loadScripts } from "../src/server-host/scripts-loader";

// Spec 020 against the local extraction (never committed, principle II); skipped without one.
// Override the folder with SOULSILVER_STAGES.

const stages = process.env["SOULSILVER_STAGES"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");
/** New Bark Town, Route 29 and Cherrygrove City. */
const ROUTE = [60, 33, 67];

describe.skipIf(!existsSync(join(stages, "events", "events", "scripts")))("scripts loader (local extraction)", () => {
  const logs: string[] = [];
  const data = loadScripts(stages, (m) => logs.push(m))!;

  it("reads the events and every script file they point at, with no schema error", () => {
    for (const map of ROUTE) {
      const events = data.events(map);
      expect(events).toBeDefined();
      const refs = [...events!.npcs, ...events!.signs, ...events!.triggers].flatMap((e) => (e.script ? [e.script] : []));
      for (const ref of refs) expect(data.file(ref.file)?.entries[ref.entry]).toBeDefined();
    }
    expect(logs).toEqual([]);
  });

  it("a sign of New Bark Town shows its text", () => {
    const sign = data.events(60)!.signs.find((s) => s.script)!;
    const host = new Proxy({ character: "male" }, { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => 0) }) as unknown as ScriptHost;
    const runner = createRunner(host, SCRIPT_HANDLERS, { file: data.file(sign.script!.file)!, entry: sign.script!.entry });
    expect(runner.step()).toMatchObject({ kind: "blocked", request: { kind: "say" } });
  });

  it("talking to a person of Route 30 in a real session asks the client to show their text", () => {
    const world = loadWorld(stages, () => undefined);
    const route30 = data.events(34)!;
    const person = route30.npcs.find((n) => n.hideFlag === 0 && n.script && route30.npcs.every((m) => m === n || Math.abs(m.x - n.x) + Math.abs(m.z - n.z) > 1))!;
    const o = world("34")!.origin!;
    const session = createSession({ seed: 1, world, scripts: data, log: () => undefined, clock: () => "2026-10-26T12:00:00.000Z", newToken: () => "t" });
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    client.onMessage((m) => got.push(m as ServerMessage));
    session.connect(server);
    // Standing just north of them, facing south.
    const save = { schemaVersion: 5, name: "Gold", character: "male", area: "34", x: (person.x - o.tx) * 16 + 8, y: (person.z - 1 - o.ty) * 16 + 8, facing: "south", playTimeMs: 0, savedAt: "2026-10-26T12:00:00.000Z", rev: 0, ...newProgress(), ...newCollection(), pending: [], flags: [], vars: {} };
    client.send({ type: "hello", protocolVersion: PROTOCOL_VERSION, save });
    session.step();
    client.send({ type: "input", seq: 1, move: { x: 0, y: 0 }, run: false, buttons: BUTTON.interact });
    session.step();
    const asked = got.find((m) => m.type === "script");
    expect(asked?.type === "script" && asked.request).toMatchObject({ kind: "say", text: expect.stringMatching(/^\d{4}:\d+$/) as string });
  });

  it("resolves global script ids without the map and the map's own ids through it", () => {
    expect(data.resolve(2000, 60)).toBeDefined();
    expect(data.resolve(1, 60)).toMatchObject({ entry: 0 });
  });
});
