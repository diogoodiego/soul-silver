// Weekday probe (spec 026, US2, T029): on the real extraction, every map-load script up to Violet City
// that reads the weekday and hides or shows a person is found, then each of the 7 days is set with
// debugSetClock and the person must be there only on the original's day. Local only: `npm run golden`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PROTOCOL_VERSION } from "@soulsilver/shared";
import type { ScriptCommand, ScriptFile } from "@soulsilver/shared/events";
import type { ServerMessage } from "@soulsilver/shared/game";
import { applyNewGame, migrate } from "@soulsilver/shared/save";
import { createMemoryConnectionPair, createSession } from "@soulsilver/server";
import { expect, it } from "vitest";
import { readNewGameStart } from "../src/server-host/extracted";
import { loadServerData } from "../src/server-host/server-data";
import type { Check } from "./report";

const stages = process.env["SOULSILVER_DATA"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");
const DAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Walkthrough pages 1 to 4, by include/constants/maps.h: New Bark, Route 29, Cherrygrove, Route 30,
// Route 31, Violet City (with Sprout Tower) and the Dark Cave's Route 31 side, houses and gates included.
const STRETCH = [60, 61, 62, 63, 64, 65, 66, 384, 33, 134, 67, 68, 69, 70, 71, 72, 144, 34, 127, 143, 35, 97, 73, 135, 149, 157, 158, 159, 160, 161, 162, 167, 110, 155, 156, 176];

const ALL = [0, 1, 2, 3, 4, 5, 6];
// The days each weekday person is there in the original (decomp scr_seq_*.s), with no badges, with all of
// them, and with all of them and every number registered (`phone`, the same as `all` when left out):
// map → person → days. Each script checks a badge before the day.
const EXPECTED: Record<number, Record<number, { none: number[]; all: number[]; phone?: number[] }>> = {
  // Tuscany (scr_seq_0225_R29.s, _000): Zephyr Badge, then Tuesday.
  33: { 10: { none: [], all: [2] } },
  // FLAG_HIDE_CAMERON in New Bark (scr_seq_0842_T20.s, _006): Plain Badge, then Tuesday.
  60: { 6: { none: [], all: [2] } },
  // The same person in Cherrygrove (scr_seq_0850_T21.s, _010): Plain Badge, then Monday, Wednesday and Friday.
  67: { 5: { none: [], all: [1, 3, 5] } },
  // Falkner in his gym (scr_seq_0859_T22GYM0101.s, _000): with the Soul Badge and his number not registered, away on
  // Mondays; with his number (CheckRegisteredPhoneNumber, spec 026), away on Wednesdays.
  135: { 0: { none: ALL, all: [0, 2, 3, 4, 5, 6], phone: [0, 1, 2, 4, 5, 6] } },
};

type Named = Extract<ScriptCommand, { name: string }>;

/** Commands reachable from `entry` inside the file, following jumps and calls (CallStd leaves the file: not followed). */
function reachable(file: ScriptFile, entry: number): Named[] {
  const start = file.labels[file.entries[entry] ?? ""];
  const seen = new Set<number>();
  const todo = start === undefined ? [] : [start];
  while (todo.length) {
    let i = todo.pop()!;
    while (i < file.code.length && !seen.has(i)) {
      seen.add(i);
      const c = file.code[i]!;
      if ("raw" in c) break;
      for (const a of Object.values(c.args)) if (a && typeof a === "object" && "label" in a && typeof a.label === "string" && a.label in file.labels) todo.push(file.labels[a.label]!);
      if (c.name === "End" || c.name === "GoTo" || c.name === "Return") break;
      i++;
    }
  }
  return [...seen].map((i) => file.code[i]!).filter((c): c is Named => !("raw" in c));
}
const flagOf = (c: Named) => {
  const f = c.args["flag"];
  return typeof f === "object" && "flag" in f ? f.flag : undefined;
};

it("weekday people up to Violet City show only on their day (spec 026, US2)", () => {
  if (!existsSync(join(stages, "events", "events", "new-game.json"))) throw new Error(`Sem extração em ${stages}. Aponte SOULSILVER_DATA para a pasta stages.`);
  const data = loadServerData(stages, () => undefined);
  const scripts = data.scripts!;
  const start = readNewGameStart(stages, () => undefined)!;

  // Every person whose hide flag a weekday-reading map-load script sets or clears.
  const found: { map: number; person: number; flag: number; script: string }[] = [];
  for (const map of STRETCH) {
    const events = scripts.events(map);
    if (!events) continue;
    for (const ref of [events.levelScripts.onTransition, events.levelScripts.onLoad, events.levelScripts.onResume]) {
      const file = ref && scripts.file(ref.file);
      if (!ref || !file) continue;
      const code = reachable(file, ref.entry);
      if (!code.some((c) => c.name === "GetWeekday")) continue;
      const flags = new Set(code.filter((c) => c.name === "SetFlag" || c.name === "ClearFlag").map(flagOf));
      for (const n of events.npcs)
        if (n.hideFlag && flags.has(n.hideFlag) && !found.some((f) => f.map === map && f.person === n.id))
          found.push({
            map,
            person: n.id,
            flag: n.hideFlag,
            script: `${ref.file}:${ref.entry}`,
          });
    }
  }

  /** The people of `map` this player sees after warping in on `weekday`. */
  function seenOn(map: number, weekday: number, at: { x: number; z: number }, badgeSet: number, contacts: number[]) {
    const session = createSession({
      seed: 1,
      world: data.world!,
      log: () => undefined,
      clock: () => "2026-11-07T12:00:00.000Z",
      newToken: () => "Dia",
      combat: data.combat,
      companion: data.companion,
      progression: data.progression,
      items: data.items,
      wild: data.wild,
      scripts,
      devTools: true,
      now: () => new Date(2026, 10, 1, 12),
    });
    const created = migrate({
      schemaVersion: 1,
      name: "Dia",
      character: "male",
      area: "0",
      x: 0,
      y: 0,
      facing: "south",
      playTimeMs: 0,
      savedAt: "2026-11-07T12:00:00.000Z",
      rev: 0,
    });
    if (!created.ok) throw new Error(created.message);
    const [server, client] = createMemoryConnectionPair();
    const got: ServerMessage[] = [];
    client.onMessage((m) => void got.push(m as ServerMessage));
    session.connect(server);
    client.send({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      save: { ...applyNewGame(created.save, start), badgeSet, phone: { contacts, seeking: [], called: [], pending: [], log: [] } },
    });
    client.send({ type: "debugScript", on: true });
    client.send({
      type: "debugSetClock",
      clock: { mode: "fixed", hour: 12, weekday },
    });
    session.step();
    got.length = 0;
    client.send({ type: "debugWarp", map, tx: at.x, ty: at.z + 1 });
    for (let i = 0; i < 3; i++) session.step();
    const shown = new Set<number>();
    for (const m of got) {
      if (m.type !== "state") continue;
      for (const e of m.spawned) if (e.kind === "npc") shown.add(e.id);
      for (const id of m.removed) shown.delete(id);
    }
    const people = new Set<number>();
    for (const e of session.world.all()) if (shown.has(e.id) && e.area === String(map)) people.add(e.data["person"] as number);
    session.close("closed-by-host");
    return people;
  }

  const checks: Check[] = [];
  for (const f of found) {
    const n = scripts.events(f.map)!.npcs.find((o) => o.id === f.person)!;
    const want = EXPECTED[f.map]?.[f.person];
    const say = (days: number[]) => (days.length === 7 ? "todo dia" : days.map((d) => DAYS[d]).join(", ") || "nunca");
    const everyNumber = (scripts.phone?.contacts ?? []).map((c) => c.id);
    const setups = [
      ["none", 0, [], "sem insígnias"],
      ["all", 0xffff, [], "com todas"],
      ["phone", 0xffff, everyNumber, "com todas e todos os números"],
    ] as const;
    for (const [key, badgeSet, contacts, label] of setups) {
      const days = ALL.filter((d) => seenOn(f.map, d, n, badgeSet, [...contacts]).has(f.person));
      const expected = want && (key === "phone" ? (want.phone ?? want.all) : want[key]);
      const name = `mapa ${f.map}, pessoa ${f.person} (flag ${f.flag}, script ${f.script}), ${label}: aparece ${say(days)}`;
      checks.push({ name, failed: !expected ? "evento sem dia esperado na sonda; confira o script da decomp e acrescente em EXPECTED" : days.join() !== expected.join() ? `esperado ${say(expected)}` : undefined });
    }
  }
  for (const [map, people] of Object.entries(EXPECTED))
    for (const person of Object.keys(people))
      if (!found.some((f) => f.map === Number(map) && f.person === Number(person)))
        checks.push({
          name: `mapa ${map}, pessoa ${person}`,
          failed: "esperado e não encontrado nos dados",
        });
  if (!found.length)
    checks.push({
      name: "eventos por dia",
      failed: "nenhum evento por dia da semana no trecho",
    });

  console.log([...checks.map((c) => (c.failed ? `FALHOU ${c.name}: ${c.failed}` : `ok  ${c.name}`)), `${checks.filter((c) => !c.failed).length} de ${checks.length} eventos por dia até Violet City`].join("\n"));
  expect(checks.filter((c) => c.failed)).toEqual([]);
});
