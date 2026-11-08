// Items the player can get up to Violet City (spec 027, research R10), from the local extraction: item balls,
// hidden items, script gifts and the Poké Mart stock for 0 or 1 badges, on the maps of the walkthrough's pages
// 1 to 4. Used by `npm run items:coverage` and the item probe (items.golden.ts). Local only (principle II).
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** New Bark to Violet City, houses, gates and the Dark Cave's Route 31 side (the same as time.golden.ts). */
export const STRETCH = [60, 61, 62, 63, 64, 65, 66, 384, 33, 134, 67, 68, 69, 70, 71, 72, 144, 34, 127, 143, 35, 97, 73, 135, 149, 157, 158, 159, 160, 161, 162, 167, 110, 155, 156, 176];
/** Routes 29, 30 and 31, where the Dowsing probe looks. */
export const ROUTES_29_TO_31 = [33, 34, 35];
/** CallStd ids of the give-item std scripts (scr_seq_0003): the item in 0x8004, the count in 0x8005. */
const GIVE_STD = new Set([2007, 2008, 2009, 2033]);
const ITEM_BALL_FILE = 141;
const VAR_ITEM = 0x8004;
const VAR_BALL_ITEM = 0x8008;
const VAR_BASE = 0x4000;
const BADGES = 1;

type Command = { name?: string; args?: Record<string, unknown> };
type Script = { entries: string[]; labels: Record<string, number>; code: Command[] };
type Sign = { kind: number; x: number; z: number; script: { id: number } | null };
const json = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const varOf = (a: unknown) => (typeof a === "object" && a !== null && "variable" in a ? (a as { variable: number }).variable : undefined);

export function defaultStages(): string {
  return process.env["SOULSILVER_DATA"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");
}

/** Item id → how it is obtained (for the report). */
export function obtainableUntilViolet(stages: string): Map<number, Set<string>> {
  const events = join(stages, "events", "events");
  const script = (file: number) => json<Script>(join(events, "scripts", `${String(file).padStart(4, "0")}.json`));
  const headers = json<{ records: { id: number; refs: { scripts: number } }[] }>(join(stages, "maps", "maps", "map-headers.json")).records;
  const hidden = new Map(json<{ hidden: { index: number; item: number }[] }>(join(events, "field-items.json")).hidden.map((h) => [h.index, h.item]));
  const balls = script(ITEM_BALL_FILE);
  const out = new Map<number, Set<string>>();
  const add = (item: number, how: string) => {
    if (item > 0 && item < VAR_BASE) out.set(item, (out.get(item) ?? new Set()).add(how));
  };
  for (const map of STRETCH) {
    const ev = json<{ npcs: { script: { id: number } | null }[]; signs: Sign[] }>(join(events, "maps", `${String(map).padStart(4, "0")}.json`));
    for (const n of ev.npcs) {
      const id = n.script?.id ?? 0;
      if (id < 7000 || id >= 8000) continue;
      const first = balls.code[balls.labels[balls.entries[id - 7000]!]!];
      if (first?.name === "SetVar" && varOf(first.args?.["var"]) === VAR_BALL_ITEM) add(first.args!["val"] as number, `bola (mapa ${map})`);
    }
    for (const g of ev.signs) if (g.kind === 2 && g.script) add(hidden.get(g.script.id - 8000) ?? 0, `escondido (mapa ${map})`);
    const file = headers.find((h) => h.id === map)?.refs.scripts;
    if (file === undefined) continue;
    const { code } = script(file);
    code.forEach((c, i) => {
      if (c.name === "GiveItem" && typeof c.args?.["arg0"] === "number") add(c.args["arg0"], `presente (script ${file})`);
      if (c.name !== "SetVar" || varOf(c.args?.["var"]) !== VAR_ITEM || typeof c.args?.["val"] !== "number") return;
      // The item goes in 0x8004 and the count in 0x8005 right before the give-item std script.
      if (code.slice(i + 1, i + 4).some((n) => n.name === "CallStd" && GIVE_STD.has(n.args?.["id"] as number))) add(c.args["val"], `presente (script ${file})`);
    });
  }
  const shops = json<{ records: { items: { item: number; minBadges: number }[] }[] }>(join(events, "shops.json")).records;
  for (const it of shops[0]?.items ?? []) if (it.minBadges <= BADGES) add(it.item, "Poké Mart");
  return out;
}

/** The hidden items of a map, with their tile (the events' own coordinates) and what they hold. */
export function hiddenOn(stages: string, map: number): { x: number; z: number; index: number; item: number; flag: number }[] {
  const events = join(stages, "events", "events");
  const table = new Map(json<{ hidden: { index: number; item: number; flag: number }[] }>(join(events, "field-items.json")).hidden.map((h) => [h.index, h]));
  const ev = json<{ signs: Sign[] }>(join(events, "maps", `${String(map).padStart(4, "0")}.json`));
  return ev.signs.flatMap((g) => {
    const h = g.kind === 2 && g.script ? table.get(g.script.id - 8000) : undefined;
    return h ? [{ x: g.x, z: g.z, index: h.index, item: h.item, flag: h.flag }] : [];
  });
}
