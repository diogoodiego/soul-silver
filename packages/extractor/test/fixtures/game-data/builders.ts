// Synthetic builders of the original binary formats (research R3–R8). Nothing here comes from
// the ROM; every value is invented for tests.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DataLayout } from "../../../src/data/layout.ts";
import type { Stage } from "../../../src/pipeline/stage.ts";
import { ByteWriter } from "../byte-writer.ts";

const pad4 = (index: number) => `${String(index).padStart(4, "0")}.bin`;

// ---------------------------------------------------------------- personal (44 bytes)

export interface PersonalInput {
  /** File order: hp, attack, defense, speed, specialAttack, specialDefense. */
  stats?: readonly number[];
  types?: readonly [number, number];
  catchRate?: number;
  baseExperience?: number;
  /** File order, 0–3 each. */
  evYield?: readonly number[];
  heldItems?: readonly [number, number];
  gender?: number;
  hatchCycles?: number;
  friendship?: number;
  growth?: number;
  eggGroups?: readonly [number, number];
  abilities?: readonly [number, number];
  flee?: number;
  /** Bits 0–6 color, bit 7 flip. */
  color?: number;
  /** Machine ids (1–100) the species can learn. */
  machines?: readonly number[];
}

export function personal(input: PersonalInput = {}): Uint8Array {
  const w = new ByteWriter();
  for (const value of input.stats ?? [45, 49, 49, 45, 65, 65]) w.u8(value);
  const types = input.types ?? [12, 3];
  w.u8(types[0]).u8(types[1]);
  w.u8(input.catchRate ?? 45).u8(input.baseExperience ?? 64);
  let evs = 0;
  (input.evYield ?? [0, 0, 0, 0, 1, 0]).forEach((value, k) => (evs |= (value & 3) << (2 * k)));
  w.u16(evs);
  const items = input.heldItems ?? [0, 0];
  w.u16(items[0]).u16(items[1]);
  w.u8(input.gender ?? 31).u8(input.hatchCycles ?? 20).u8(input.friendship ?? 70).u8(input.growth ?? 3);
  const egg = input.eggGroups ?? [1, 7];
  w.u8(egg[0]).u8(egg[1]);
  const abilities = input.abilities ?? [65, 0];
  w.u8(abilities[0]).u8(abilities[1]);
  w.u8(input.flee ?? 0).u8(input.color ?? 0).u16(0);
  const bits = new Uint8Array(16);
  for (const machine of input.machines ?? []) bits[(machine - 1) >> 3]! |= 1 << ((machine - 1) & 7);
  w.raw(bits);
  return w.toBytes();
}

// ---------------------------------------------------------------- move (16 bytes)

export interface MoveInput {
  effect?: number;
  category?: number;
  power?: number;
  type?: number;
  accuracy?: number;
  pp?: number;
  chance?: number;
  target?: number;
  /** Signed. */
  priority?: number;
  flags?: number;
  contestEffect?: number;
  contestType?: number;
}

export function move(input: MoveInput = {}): Uint8Array {
  return new ByteWriter()
    .u16(input.effect ?? 0)
    .u8(input.category ?? 0)
    .u8(input.power ?? 40)
    .u8(input.type ?? 0)
    .u8(input.accuracy ?? 100)
    .u8(input.pp ?? 35)
    .u8(input.chance ?? 0)
    .u16(input.target ?? 0)
    .u8((input.priority ?? 0) & 0xff)
    .u8(input.flags ?? 0)
    .u8(input.contestEffect ?? 0)
    .u8(input.contestType ?? 0)
    .u16(0)
    .toBytes();
}

// ---------------------------------------------------------------- item (34 bytes)

export interface ItemInput {
  price?: number;
  holdEffect?: number;
  holdParam?: number;
  pluck?: number;
  flingEffect?: number;
  flingPower?: number;
  naturalGiftPower?: number;
  naturalGiftType?: number;
  preventToss?: boolean;
  selectable?: boolean;
  pocket?: number;
  battlePockets?: number;
  fieldUse?: number;
  battleUse?: number;
  partyUseKind?: number;
  /** Up to 20 bytes. */
  partyParams?: readonly number[];
}

export function item(input: ItemInput = {}): Uint8Array {
  const bits =
    ((input.naturalGiftType ?? 31) & 31) |
    ((input.preventToss ? 1 : 0) << 5) |
    ((input.selectable ? 1 : 0) << 6) |
    ((input.pocket ?? 0) << 7) |
    ((input.battlePockets ?? 0) << 11);
  const params = new Uint8Array(20);
  params.set(input.partyParams ?? []);
  return new ByteWriter()
    .u16(input.price ?? 0)
    .u8(input.holdEffect ?? 0)
    .u8(input.holdParam ?? 0)
    .u8(input.pluck ?? 0)
    .u8(input.flingEffect ?? 0)
    .u8(input.flingPower ?? 0)
    .u8(input.naturalGiftPower ?? 0)
    .u16(bits)
    .u8(input.fieldUse ?? 0)
    .u8(input.battleUse ?? 0)
    .u8(input.partyUseKind ?? 0)
    .u8(0)
    .raw(params)
    .toBytes();
}

// ---------------------------------------------------------------- learnsets, evolutions, growth

/** `(level << 9) | move` per entry, ended by 0xFFFF. */
export function levelUp(pairs: ReadonlyArray<readonly [level: number, move: number]>): Uint8Array {
  const w = new ByteWriter();
  for (const [level, moveId] of pairs) w.u16((level << 9) | moveId);
  return w.u16(0xffff).toBytes();
}

/** Seven `{method, parameter, into}` entries plus padding (44 bytes). */
export function evolutions(entries: ReadonlyArray<readonly [method: number, parameter: number, into: number]>): Uint8Array {
  const w = new ByteWriter();
  for (let k = 0; k < 7; k++) {
    const [method, parameter, into] = entries[k] ?? [0, 0, 0];
    w.u16(method).u16(parameter).u16(into);
  }
  return w.u16(0).toBytes();
}

/** A species marker (20000 + species) followed by its moves, per species; ended by 0xFFFF. */
export function eggMoves(bySpecies: Readonly<Record<number, readonly number[]>>): Uint8Array {
  const w = new ByteWriter();
  for (const species of Object.keys(bySpecies).map(Number).sort((a, b) => a - b)) {
    w.u16(20000 + species);
    for (const moveId of bySpecies[species]!) w.u16(moveId);
  }
  return w.u16(0xffff).toBytes();
}

/** 101 u32 values: experience for levels 0 to 100. */
export function growth(levels0to100: readonly number[]): Uint8Array {
  if (levels0to100.length !== 101) throw new Error("growth needs 101 values");
  const w = new ByteWriter();
  for (const value of levels0to100) w.u32(value);
  return w.toBytes();
}

/** One u64 per entry; bit k links the entry to tutor k. */
export function tutorCompat(entries: readonly bigint[]): Uint8Array {
  const w = new ByteWriter();
  for (const entry of entries) w.u32(Number(entry & 0xffffffffn)).u32(Number(entry >> 32n));
  return w.toBytes();
}

// ---------------------------------------------------------------- tables read from code

/** Triples `(attacker, defender, tenths)`, the 254 separator, the Foresight pairs, then 255. */
export function typeChart(
  triples: ReadonlyArray<readonly [number, number, number]>,
  foresightPairs: ReadonlyArray<readonly [number, number]> = [],
): Uint8Array {
  const w = new ByteWriter();
  for (const [a, d, m] of triples) w.u8(a).u8(d).u8(m);
  w.u8(254).u8(254).u8(0);
  for (const [a, d] of foresightPairs) w.u8(a).u8(d).u8(0);
  return w.u8(255).u8(255).u8(0).toBytes();
}

/** Rows of five signed values: attack, defense, speed, specialAttack, specialDefense. */
export function natures(rows: ReadonlyArray<readonly number[]>): Uint8Array {
  const w = new ByteWriter();
  for (const row of rows) for (const value of row) w.u8(value & 0xff);
  return w.toBytes();
}

/** The 25 natures in game order: row i raises stat floor(i/5) and lowers stat i%5. */
export function standardNatureRows(): number[][] {
  return Array.from({ length: 25 }, (_, i) => {
    const row = [0, 0, 0, 0, 0];
    const up = Math.floor(i / 5);
    const down = i % 5;
    if (up !== down) {
      row[up] = 1;
      row[down] = -1;
    }
    return row;
  });
}

/** u16 move per machine, then a 0 terminator. */
export function machineTable(moves: readonly number[]): Uint8Array {
  const w = new ByteWriter();
  for (const moveId of moves) w.u16(moveId);
  return w.u16(0).toBytes();
}

/** `{u16 move, u8 cost, u8 area}` records followed by one garbage record, like the real table. */
export function tutorList(records: ReadonlyArray<{ move: number; cost: number; area: number }>): Uint8Array {
  const w = new ByteWriter();
  for (const r of records) w.u16(r.move).u8(r.cost).u8(r.area);
  return w.u16(0x1000).u8(0).u8(0).toBytes();
}

/** `{dataIndex, icon, palette, gen3Id}` per item id, starting at id 0. */
export function itemMap(dataIndexByItemId: readonly number[]): Uint8Array {
  const w = new ByteWriter();
  for (const dataIndex of dataIndexByItemId) w.u16(dataIndex).u16(0).u16(0).u16(0);
  return w.toBytes();
}

/** Header of a message bank: entry count and seed. */
export function msgBankHeader(count: number): Uint8Array {
  return new ByteWriter().u16(count).u16(0x1234).u32(0).toBytes();
}

// ---------------------------------------------------------------- the synthetic world

/** A small, consistent set of inputs for the data stages (see SYNTHETIC_* for what it holds). */
export interface SyntheticInputs {
  layout: DataLayout;
  /** By personal index. */
  personal: Uint8Array[];
  /** By move id. */
  moves: Uint8Array[];
  /** By personal index. */
  levelUp: Uint8Array[];
  /** By personal index. */
  evolutions: Uint8Array[];
  /** By data index. */
  items: Uint8Array[];
  growth: Uint8Array[];
  eggMoves: Uint8Array;
  /** Message bank number → bytes. */
  messages: Map<number, Uint8Array>;
  tutorCompat: Uint8Array;
  arm9: Uint8Array;
  /** Decompressed overlay9 files by index. */
  overlays: Uint8Array[];
}

export function syntheticLayout(): DataLayout {
  return {
    narc: {
      personal: "a/0/0/2",
      moves: "a/0/1/1",
      levelUp: "a/0/3/3",
      evolutions: "a/0/3/4",
      eggMoves: "a/2/2/9",
      items: "a/0/1/7",
      growth: "a/0/0/3",
      messages: "a/0/2/7",
    },
    abilityNameBank: 720,
    tutorCompatFile: "fielddata/wazaoshie/waza_oshie.bin",
    arm9: { natures: 0x100, machines: 0x200, itemMap: 0x400 },
    overlay: { typeChart: { overlay: 0, offset: 0x40 }, tutors: { overlay: 1, offset: 0x80 } },
    counts: {
      species: 6,
      moves: 8,
      items: 10,
      machines: 100,
      tutors: 3,
      tutorCompatEntries: 8,
      natures: 25,
      types: 18,
      growthRates: 6,
    },
    forms: [
      { personalIndex: 9, species: 3, form: 1 },
      { personalIndex: 10, species: 5, form: 1 },
    ],
  };
}

const blank = (length: number) => new Uint8Array(length);

/** Machine k (1–100) teaches move ((k - 1) % 8) + 1. */
export const SYNTHETIC_MACHINE_MOVE = (machine: number) => ((machine - 1) % 8) + 1;

/** Experience for level L in synthetic group g: floor(L³ × (1 + g/10)); level 0 is 0. */
export const SYNTHETIC_EXPERIENCE = (group: number, level: number) => Math.floor(level ** 3 * (1 + group / 10));

export function syntheticInputs(): SyntheticInputs {
  const layout = syntheticLayout();

  // Personal members: 0 blank, 1–6 species, 7–8 eggs (ignored), 9–10 forms.
  const personals = [
    blank(44),
    personal({ stats: [45, 49, 49, 45, 65, 65], types: [12, 3], abilities: [65, 0], machines: [1, 2, 93] }),
    personal({ stats: [60, 62, 63, 60, 80, 80], types: [12, 3], abilities: [65, 0], evYield: [0, 0, 0, 0, 1, 1] }),
    personal({ stats: [80, 82, 83, 80, 100, 100], types: [12, 3], abilities: [65, 0], evYield: [0, 0, 0, 0, 2, 1], baseExperience: 236 }),
    personal({ stats: [39, 52, 43, 65, 60, 50], types: [10, 10], abilities: [66, 0], gender: 31, color: 0x81 }),
    personal({
      stats: [30, 40, 50, 60, 70, 80],
      types: [14, 14],
      abilities: [2, 0],
      gender: 255,
      heldItems: [2, 5],
      eggGroups: [15, 15],
      growth: 5,
    }),
    personal({ stats: [70, 60, 50, 40, 30, 20], types: [0, 2], abilities: [1, 3], gender: 0, growth: 0, machines: [100] }),
    blank(44),
    blank(44),
    personal({ stats: [80, 100, 83, 80, 100, 100], types: [12, 3], abilities: [65, 0] }),
    personal({ stats: [30, 40, 50, 60, 70, 80], types: [14, 15], abilities: [2, 0], gender: 255 }),
  ];

  const levelUps = [
    levelUp([]),
    levelUp([[1, 1], [3, 2], [7, 3]]),
    levelUp([[1, 1], [1, 2], [20, 4]]),
    levelUp([[1, 1], [36, 8]]),
    levelUp([[1, 5], [10, 6]]),
    levelUp([[5, 7]]),
    levelUp([[1, 1], [100, 8]]),
    levelUp([]),
    levelUp([]),
    levelUp([[1, 1], [40, 7]]),
    levelUp([[1, 7]]),
  ];

  const evolutionTable = [
    evolutions([]),
    evolutions([[4, 16, 2]]),
    evolutions([[4, 32, 3], [7, 3, 4], [20, 5, 5]]),
    evolutions([]),
    evolutions([]),
    evolutions([]),
    evolutions([]),
    evolutions([]),
    evolutions([]),
    evolutions([]),
    evolutions([]),
  ];

  const moves = [
    blank(16),
    move({ category: 0, power: 40, type: 0, accuracy: 100, pp: 35, flags: 0x73 }),
    move({ category: 2, power: 0, type: 0, accuracy: 100, pp: 40, effect: 45, target: 8 }),
    move({ category: 0, power: 60, type: 2, accuracy: 0, pp: 20, effect: 100, flags: 0x12 }),
    move({ category: 0, power: 1, type: 1, accuracy: 100, pp: 20, effect: 197, flags: 0x03 }),
    move({ category: 0, power: 40, type: 0, accuracy: 100, pp: 30, priority: 1, flags: 0x73 }),
    move({ category: 0, power: 60, type: 1, accuracy: 90, pp: 10, priority: -6, flags: 0x33 }),
    move({ category: 1, power: 95, type: 10, accuracy: 100, pp: 15, effect: 4, chance: 10, flags: 0x12 }),
    move({ category: 1, power: 80, type: 11, accuracy: 100, pp: 15, target: 3, flags: 0x12 }),
    move({ power: 10 }),
    move({ power: 20 }),
  ];

  // Item ids 0–10 → data members; ids 4 and 10 are unused (data 0).
  const itemDataIndex = [0, 1, 2, 3, 0, 4, 5, 6, 7, 8, 0];
  const items = [
    blank(34),
    item({ price: 200, pocket: 2, battleUse: 1, selectable: true, battlePockets: 4 }),
    item({ price: 300, pocket: 1, fieldUse: 1, partyUseKind: 2, partyParams: [0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xab] }),
    item({ price: 0, pocket: 7, preventToss: true }),
    item({ price: 20, pocket: 4, naturalGiftPower: 60, naturalGiftType: 12, flingPower: 10 }),
    item({ price: 1000, pocket: 3 }),
    item({ price: 600, pocket: 0, holdEffect: 70, holdParam: 20 }),
    item({ price: 50, pocket: 5 }),
    item({ price: 150, pocket: 6, battleUse: 2 }),
  ];

  const growthTable = Array.from({ length: 8 }, (_, member) => {
    const group = member >= 6 ? 0 : member;
    return growth(Array.from({ length: 101 }, (_, level) => SYNTHETIC_EXPERIENCE(group, level)));
  });

  // 8 entries: species 1–6, then the two forms. Bit k = tutor k.
  const tutorCompatEntries = [0b011n, 0n, 0b100n, 0n, 0b001n, 0b111n, 0b001n, 0b111n];

  const arm9 = new Uint8Array(0x600);
  arm9.set(natures(standardNatureRows()), layout.arm9.natures);
  arm9.set(machineTable(Array.from({ length: 100 }, (_, k) => SYNTHETIC_MACHINE_MOVE(k + 1))), layout.arm9.machines);
  arm9.set(itemMap(itemDataIndex), layout.arm9.itemMap);

  const chartOverlay = new Uint8Array(0x400);
  chartOverlay.set(
    typeChart(
      [
        [10, 10, 5],
        [10, 12, 20],
        [11, 10, 20],
        [0, 8, 5],
        [13, 4, 0],
        [0, 7, 0],
        [1, 7, 0],
      ],
      [
        [0, 7],
        [1, 7],
      ],
    ),
    layout.overlay.typeChart.offset,
  );
  const tutorOverlay = new Uint8Array(0x400);
  tutorOverlay.set(
    tutorList([
      { move: 3, cost: 40, area: 0 },
      { move: 6, cost: 32, area: 1 },
      { move: 8, cost: 0, area: 3 },
    ]),
    layout.overlay.tutors.offset,
  );

  return {
    layout,
    personal: personals,
    moves,
    levelUp: levelUps,
    evolutions: evolutionTable,
    items,
    growth: growthTable,
    eggMoves: eggMoves({ 1: [4, 5], 4: [2] }),
    messages: new Map([[layout.abilityNameBank, msgBankHeader(4)]]),
    tutorCompat: tutorCompat(tutorCompatEntries),
    arm9,
    overlays: [chartOverlay, tutorOverlay],
  };
}

async function writeMembers(dir: string, members: readonly Uint8Array[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [index, bytes] of members.entries()) await writeFile(join(dir, pad4(index)), bytes);
}

/** Lays the inputs out the way `rom-unpack` and `code-decompress` leave them. */
export async function writeInputs(
  dirs: { narc?: string; filesystem?: string; code?: string },
  inputs: SyntheticInputs,
): Promise<void> {
  const { layout } = inputs;
  if (dirs.narc !== undefined) {
    const narc = (path: string) => join(dirs.narc!, ...path.split("/"));
    await writeMembers(narc(layout.narc.personal), inputs.personal);
    await writeMembers(narc(layout.narc.moves), inputs.moves);
    await writeMembers(narc(layout.narc.levelUp), inputs.levelUp);
    await writeMembers(narc(layout.narc.evolutions), inputs.evolutions);
    await writeMembers(narc(layout.narc.eggMoves), [inputs.eggMoves]);
    await writeMembers(narc(layout.narc.items), inputs.items);
    await writeMembers(narc(layout.narc.growth), inputs.growth);
    await mkdir(narc(layout.narc.messages), { recursive: true });
    for (const [bank, bytes] of inputs.messages) await writeFile(join(narc(layout.narc.messages), pad4(bank)), bytes);
  }
  if (dirs.filesystem !== undefined) {
    const file = join(dirs.filesystem, ...layout.tutorCompatFile.split("/"));
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, inputs.tutorCompat);
  }
  if (dirs.code !== undefined) {
    await mkdir(join(dirs.code, "overlay9"), { recursive: true });
    await writeFile(join(dirs.code, "arm9.bin"), inputs.arm9);
    for (const [index, bytes] of inputs.overlays.entries()) await writeFile(join(dirs.code, "overlay9", pad4(index)), bytes);
  }
}

/**
 * Stand-ins for `rom-unpack` and `code-decompress` that write the synthetic inputs, so the data
 * stages can run through the real pipeline without a ROM.
 */
export function syntheticInputStages(inputs: SyntheticInputs): Stage[] {
  return [
    {
      id: "rom-unpack",
      title: "Desempacotando a ROM",
      version: 1,
      weight: 1,
      inputs: [{ kind: "rom" }],
      outputs: ["binaries", "filesystem", "narc"],
      estimateBytes: () => 1024,
      run: async (ctx) => {
        await writeFile(join(ctx.outputDir("binaries"), "placeholder.bin"), "x");
        await writeInputs({ narc: ctx.outputDir("narc"), filesystem: ctx.outputDir("filesystem") }, inputs);
      },
    },
    {
      id: "code-decompress",
      title: "Descomprimindo o código do jogo",
      version: 1,
      weight: 1,
      inputs: [{ kind: "stage", stage: "rom-unpack", output: "binaries" }],
      outputs: ["code"],
      estimateBytes: () => 1024,
      run: async (ctx) => {
        await writeInputs({ code: ctx.outputDir("code") }, inputs);
      },
    },
  ];
}
