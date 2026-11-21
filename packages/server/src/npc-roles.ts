import { COMMON_MART, type ScriptFile } from "@soulsilver/shared/events";

// Block H: what a person offers besides talking, read from the commands their script can reach. A clerk's
// script reaches MartBuy through the mart's common script (std 2048), a store floor's SpecialMartBuy with the
// floor in a variable set before it; a nurse's reaches HealParty through std 2002.

export type NpcRole = { role: "shop"; shop: number } | { role: "heal" };

/** Commands walked before giving up: a common script runs to a few hundred. */
const WALK_MAX = 4000;
/** Arguments 0x4000 and up name a variable (vars.h). */
const VAR_FIRST = 0x4000;

/**
 * The service `ref`'s script reaches, following GoTo, Call and CallStd down every branch; undefined when there is
 * none. `heals` is false outside a Pokémon Center: Mom and Mr. Pokémon heal, but are people to talk to.
 * shortcut: a store floor's variable is the last constant SetVar walked before it; read the branch taken if a floor ever sets two.
 */
export function npcRole(ref: { file: number; entry: number }, file: (id: number) => ScriptFile | undefined, resolve: (id: number) => { file: number; entry: number } | undefined, heals: boolean): NpcRole | undefined {
  const vars = new Map<number, number>();
  const seen = new Set<string>();
  const todo: { file: ScriptFile; at: number }[] = [];
  const push = (f: ScriptFile | undefined, at: number | undefined) => {
    if (f && at !== undefined && !seen.has(`${f.file}:${at}`)) todo.push({ file: f, at });
  };
  const entry = file(ref.file);
  push(entry, entry && entry.labels[entry.entries[ref.entry] ?? ""]);
  let healer = false;
  for (let walked = 0; todo.length > 0 && walked < WALK_MAX; walked++) {
    const { file: f, at } = todo.pop()!;
    if (seen.has(`${f.file}:${at}`)) continue;
    seen.add(`${f.file}:${at}`);
    const c = f.code[at];
    if (!c || !("name" in c)) continue;
    const a = c.args as Record<string, unknown>;
    const label = (key: string) => f.labels[((a[key] ?? {}) as { label?: string }).label ?? ""];
    const value = (v: unknown) => (typeof v === "number" ? (v >= VAR_FIRST ? vars.get(v) : v) : undefined);
    switch (c.name) {
      case "MartBuy":
        return { role: "shop", shop: COMMON_MART };
      case "SpecialMartBuy": {
        const floor = value(a["arg0"]);
        if (floor !== undefined) return { role: "shop", shop: floor + 1 };
        break;
      }
      case "HealParty":
        healer = heals;
        break;
      case "SetVar": {
        const v = (a["var"] as { variable?: number } | undefined)?.variable;
        if (v !== undefined && typeof a["val"] === "number") vars.set(v, a["val"]);
        break;
      }
      case "CallStd": {
        const to = typeof a["id"] === "number" ? resolve(a["id"]) : undefined;
        const g = to && file(to.file);
        push(g, g && g.labels[g.entries[to.entry] ?? ""]);
        break;
      }
      case "GoTo":
        push(f, label("dest"));
        continue;
      case "GoToIf":
        push(f, label("dest"));
        break;
      case "Call":
      case "CallIf":
        push(f, label("sub"));
        break;
    }
    if (c.name === "End" || c.name === "Return" || c.name === "RestartCurrentScript") continue;
    push(f, at + 1);
  }
  return healer ? { role: "heal" } : undefined;
}
