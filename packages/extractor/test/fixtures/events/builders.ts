import { ByteWriter } from "../byte-writer.ts";

// Synthetic builders for the event formats (specs/008-events-scripts-encounters/research.md R0).

export interface ObjectSpec {
  id?: number;
  sprite?: number;
  movement?: number;
  type?: number;
  hideFlag?: number;
  script?: number;
  facing?: number;
  param?: [number, number, number];
  xRange?: number;
  yRange?: number;
  x?: number;
  z?: number;
  y?: number;
}
export interface WarpSpec { x?: number; z?: number; header?: number; anchor?: number; y?: number }
export interface CoordSpec { script?: number; x?: number; z?: number; w?: number; h?: number; y?: number; value?: number; variable?: number }
export interface BgSpec { script?: number; type?: number; x?: number; z?: number; y?: number; dir?: number }

/** A zone event file: four counted lists of 20, 32, 12 and 16 bytes (bgs, objects, warps, coords). */
export function buildZone(spec: { bgs?: BgSpec[]; objects?: ObjectSpec[]; warps?: WarpSpec[]; coords?: CoordSpec[] }): Uint8Array {
  const w = new ByteWriter();
  const bgs = spec.bgs ?? [];
  w.u32(bgs.length);
  for (const b of bgs) w.u16(b.script ?? 0).u16(b.type ?? 0).u32(b.x ?? 0).u32(b.z ?? 0).u32(b.y ?? 0).u16(b.dir ?? 0).u16(0);
  const objects = spec.objects ?? [];
  w.u32(objects.length);
  for (const o of objects) {
    w.u16(o.id ?? 0).u16(o.sprite ?? 0).u16(o.movement ?? 0).u16(o.type ?? 0).u16(o.hideFlag ?? 0).u16(o.script ?? 0);
    w.u16(o.facing ?? 0);
    for (const p of o.param ?? [0, 0, 0]) w.u16(p);
    w.u16(o.xRange ?? 0).u16(o.yRange ?? 0).u16(o.x ?? 0).u16(o.z ?? 0).u32(o.y ?? 0);
  }
  const warps = spec.warps ?? [];
  w.u32(warps.length);
  for (const p of warps) w.u16(p.x ?? 0).u16(p.z ?? 0).u16(p.header ?? 0).u16(p.anchor ?? 0).u32(p.y ?? 0);
  const coords = spec.coords ?? [];
  w.u32(coords.length);
  for (const c of coords) w.u16(c.script ?? 0).u16(c.x ?? 0).u16(c.z ?? 0).u16(c.w ?? 1).u16(c.h ?? 1).u16(c.y ?? 0).u16(c.value ?? 0).u16(c.variable ?? 0);
  return w.toBytes();
}

/** One command: a u16 id followed by arguments given as [size, value] pairs. */
export function cmd(id: number, ...args: [1 | 2 | 4, number][]): Uint8Array {
  const w = new ByteWriter().u16(id);
  for (const [size, value] of args) {
    if (size === 1) w.u8(value);
    else if (size === 2) w.u16(value);
    else w.u32(value);
  }
  return w.toBytes();
}

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const w = new ByteWriter();
  for (const p of parts) w.raw(p);
  return w.toBytes();
};

/** A relative jump operand: the target is `to`, measured from the end of this 4-byte operand at `at`. */
export const rel = (to: number, at: number): [4, number] => [4, (to - (at + 4)) >>> 0];

/**
 * A script file: one u32 per entry (relative to the end of its own field), the 0xFD13 end marker,
 * then `body`. `entries` are offsets into the body.
 */
export function buildScriptFile(entries: number[], body: Uint8Array): Uint8Array {
  const w = new ByteWriter();
  const codeStart = entries.length * 4 + 2;
  entries.forEach((entry, i) => w.u32(codeStart + entry - (i * 4 + 4)));
  w.u16(0xfd13);
  return w.raw(body).toBytes();
}

/**
 * A level script ("script header") file: 5-byte records, a 0 end byte, then (with a frame table)
 * its rows. The frame table record comes last; its offset is relative to the end of that record.
 */
export function buildLevelScripts(spec: { fixed?: [number, number][]; frames?: [number, number, number][] }): Uint8Array {
  const w = new ByteWriter();
  for (const [type, script] of spec.fixed ?? []) w.u8(type).u16(script).u16(0);
  if (spec.frames) w.u8(1).u32(1);
  w.u8(0);
  for (const [variable, value, script] of spec.frames ?? []) w.u16(variable).u16(value).u16(script);
  if (spec.frames) w.u16(0);
  return w.toBytes();
}

export interface SlotSpec { species: number; minLevel: number; maxLevel: number }

/** A 0xC4-byte wild encounter record (wild_encounter.h). */
export function buildEncounter(spec: {
  rates?: [number, number, number, number, number, number];
  levels?: number[];
  morning?: number[];
  day?: number[];
  night?: number[];
  sounds?: [number[], number[]];
  surf?: SlotSpec[];
  rockSmash?: SlotSpec[];
  oldRod?: SlotSpec[];
  goodRod?: SlotSpec[];
  superRod?: SlotSpec[];
  swarm?: [number, number, number, number];
}): Uint8Array {
  const w = new ByteWriter();
  for (const r of spec.rates ?? [0, 0, 0, 0, 0, 0]) w.u8(r);
  w.u8(0).u8(0);
  for (let i = 0; i < 12; i++) w.u8(spec.levels?.[i] ?? 0);
  for (const times of [spec.morning, spec.day, spec.night]) for (let i = 0; i < 12; i++) w.u16(times?.[i] ?? 0);
  for (const group of spec.sounds ?? [[], []]) for (let i = 0; i < 2; i++) w.u16(group[i] ?? 0);
  const slots = (list: SlotSpec[] | undefined, count: number) => {
    for (let i = 0; i < count; i++) {
      const s = list?.[i];
      w.u8(s?.minLevel ?? 0).u8(s?.maxLevel ?? 0).u16(s?.species ?? 0);
    }
  };
  slots(spec.surf, 5);
  slots(spec.rockSmash, 2);
  slots(spec.oldRod, 5);
  slots(spec.goodRod, 5);
  slots(spec.superRod, 5);
  for (const s of spec.swarm ?? [0, 0, 0, 0]) w.u16(s);
  return w.toBytes();
}

export interface TeamSpec {
  difficulty?: number;
  gender?: number;
  level: number;
  species: number;
  form?: number;
  item?: number;
  moves?: number[];
  capsule?: number;
}

/** A 20-byte trainer record. */
export function buildTrainerData(spec: { type: number; class: number; count: number; items?: number[]; aiFlags?: number; double?: number }): Uint8Array {
  const w = new ByteWriter().u8(spec.type).u8(spec.class).u8(0).u8(spec.count);
  for (let i = 0; i < 4; i++) w.u16(spec.items?.[i] ?? 0);
  return w.u32(spec.aiFlags ?? 0).u32(spec.double ?? 0).toBytes();
}

/** A trainer's team: 8 bytes per Pokémon, +2 with an item (type bit 1), +8 with moves (type bit 0). */
export function buildTrainerTeam(type: number, team: TeamSpec[]): Uint8Array {
  const w = new ByteWriter();
  for (const m of team) {
    w.u8(m.difficulty ?? 0).u8(m.gender ?? 0).u16(m.level).u16(m.species | ((m.form ?? 0) << 10));
    if (type & 2) w.u16(m.item ?? 0);
    if (type & 1) for (let i = 0; i < 4; i++) w.u16(m.moves?.[i] ?? 0);
    w.u16(m.capsule ?? 0);
  }
  return w.toBytes();
}

/** A headbutt member: counts, three tables of six slots (u16 species, u8 min, u8 max) and six coordinate pairs per tree group. */
export function buildHeadbutt(spec: { common?: SlotSpec[]; rare?: SlotSpec[]; secret?: SlotSpec[]; regular?: [number, number][][]; secretTrees?: [number, number][][] }): Uint8Array {
  const regular = spec.regular ?? [];
  const secret = spec.secretTrees ?? [];
  if (regular.length + secret.length === 0) return new Uint8Array(4);
  const w = new ByteWriter().u16(regular.length).u16(secret.length);
  for (const list of [spec.common, spec.rare, spec.secret]) {
    for (let i = 0; i < 6; i++) {
      const s = list?.[i];
      w.u16(s?.species ?? 0).u8(s?.minLevel ?? 0).u8(s?.maxLevel ?? 0);
    }
  }
  for (const group of [...regular, ...secret]) {
    for (let i = 0; i < 6; i++) w.u16(group[i]?.[0] ?? 0xffff).u16(group[i]?.[1] ?? 0xffff);
  }
  return w.toBytes();
}
