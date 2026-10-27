// Synthetic scripts and a host that records what scripts do (spec 020; no ROM data, principle II).
import type { ScriptCommand, ScriptFile } from "../../src/events/schemas.ts";
import type { ScriptEvent, ScriptHost } from "../../src/script/host.ts";

type Line = string | [name: string, args?: Record<string, unknown>] | ScriptCommand;

/**
 * `lines` is the code in order; a string line like "L2:" labels the next command. Every entry
 * label must be defined. Jumps are written as { label: "L2" }.
 */
export function makeScript(lines: Line[], options: { file?: number; entries?: string[]; messageBank?: number | null } = {}): ScriptFile {
  const code: ScriptCommand[] = [];
  const labels: Record<string, number> = {};
  for (const line of lines) {
    if (typeof line === "string") labels[line.replace(/:$/, "")] = code.length;
    else if (Array.isArray(line)) code.push({ name: line[0], args: (line[1] ?? {}) as Record<string, never> });
    else code.push(line);
  }
  const entries = options.entries ?? ["L1"];
  if (!("L1" in labels)) labels["L1"] = 0;
  return { kind: "script-file", formatVersion: 1, file: options.file ?? 1, messageBank: options.messageBank === undefined ? 7 : options.messageBank, entries, code, labels, movements: {}, unreachableBytes: 0, partial: false };
}

export interface FakeHost extends ScriptHost {
  flags: Set<number>;
  vars: Map<number, number>;
  events: ScriptEvent[];
  bag: Map<number, number>;
  party: { species: number; level: number; hp: number }[];
  storage: number;
  wallet: number;
  badges: Set<number>;
  warps: { map: number; x: number; z: number; facing: number }[];
  hidden: number[];
  shown: number[];
  faced: number;
  bridged: string[];
  /** Commands the host claims for later specs. */
  supported: Set<string>;
  files: Map<number, ScriptFile>;
  std: Map<number, { file: number; entry: number }>;
  position: { x: number; z: number; facing: number };
}

export function fakeHost(over: Partial<FakeHost> = {}): FakeHost {
  const host: FakeHost = {
    flags: new Set(),
    vars: new Map(),
    events: [],
    bag: new Map(),
    party: [],
    storage: 0,
    wallet: 3000,
    badges: new Set(),
    warps: [],
    hidden: [],
    shown: [],
    faced: 0,
    bridged: [],
    supported: new Set(),
    files: new Map(),
    std: new Map(),
    position: { x: 10, z: 20, facing: 1 },
    character: "male",
    flag: (id) => host.flags.has(id),
    setFlag: (id, on) => void (on ? host.flags.add(id) : host.flags.delete(id)),
    getVar: (id) => host.vars.get(id) ?? 0,
    setVar: (id, v) => void host.vars.set(id, v),
    money: () => host.wallet,
    addMoney: (n) => void (host.wallet = Math.max(0, Math.min(999999, host.wallet + n))),
    giveItem(item, count) {
      if (!host.hasSpaceForItem(item, count)) return false;
      host.bag.set(item, (host.bag.get(item) ?? 0) + count);
      return true;
    },
    takeItem(item, count) {
      if (!host.hasItem(item, count)) return false;
      const left = host.bag.get(item)! - count;
      if (left === 0) host.bag.delete(item);
      else host.bag.set(item, left);
      return true;
    },
    hasItem: (item, count) => (host.bag.get(item) ?? 0) >= count,
    hasSpaceForItem: (item, count) => (host.bag.get(item) ?? 0) + count <= 999,
    partyCount: () => host.party.length,
    partySpecies: (slot) => host.party[slot]?.species ?? 0,
    partyLeadAlive() {
      const i = host.party.findIndex((m) => m.hp > 0);
      return i === -1 ? host.party.length : i;
    },
    giveMon(species, level) {
      if (host.party.length < 6) host.party.push({ species, level, hp: 1 });
      else if (host.storage < 30) host.storage++;
      else return false;
      return true;
    },
    healParty: () => host.party.forEach((m) => (m.hp = 99)),
    hasBadge: (b) => host.badges.has(b),
    giveBadge: (b) => void host.badges.add(b),
    playerPosition: () => host.position,
    warp: (map, x, z, facing) => void host.warps.push({ map, x, z, facing }),
    facePlayer: () => void host.faced++,
    hidePerson: (id) => void host.hidden.push(id),
    showPerson: (id) => void host.shown.push(id),
    personPosition: (id) => (id === 1 ? { x: 3, z: 4 } : undefined),
    movePerson: () => undefined,
    weekday: () => 2,
    emit: (e) => void host.events.push(e),
    bridge(command) {
      host.bridged.push(command);
      return host.supported.has(command);
    },
    file: (id) => host.files.get(id),
    resolve: (id) => host.std.get(id),
    ...over,
  };
  return host;
}
