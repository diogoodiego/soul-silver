import { ByteWriter } from "../byte-writer.ts";

// Synthetic builders for the Nitro sound formats (specs/009-audio-extraction/research.md R0, R9).

/** A Nitro file: magic, BOM, version 1.0, total size, 16-byte header, one block. */
function nitro(magic: string, blockMagic: string, block: Uint8Array): Uint8Array {
  const w = new ByteWriter().ascii(magic).u16(0xfeff).u16(0x0100).u32(16 + 8 + block.length).u16(16).u16(1);
  return w.ascii(blockMagic).u32(8 + block.length).raw(block).toBytes();
}

/** A sequence: events start right after the DATA header (file offset 0x1C); offsets in events count from there. */
export function buildSseq(events: Uint8Array | number[]): Uint8Array {
  const data = new ByteWriter().u32(0x1c).raw(Uint8Array.from(events)).toBytes();
  return nitro("SSEQ", "DATA", data);
}

export interface WaveSpec {
  /** 0 PCM8, 1 PCM16, 2 IMA ADPCM. */
  type: 0 | 1 | 2;
  rate: number;
  /** Raw sample data (for ADPCM, including its 4-byte header); padded to whole words. */
  data: Uint8Array | number[];
  /** Loop start in words; undefined for a one-shot wave. */
  loopWords?: number;
}

/** A wave archive: offsets to SWAV records (12-byte info + data). */
export function buildSwar(waves: WaveSpec[]): Uint8Array {
  const tableAt = 16 + 8 + 32 + 4;
  let at = tableAt + waves.length * 4;
  const offsets: number[] = [];
  const body = new ByteWriter();
  for (const wave of waves) {
    offsets.push(at);
    const data = Uint8Array.from(wave.data);
    const words = Math.ceil(data.length / 4);
    const loop = wave.loopWords ?? 0;
    body.u8(wave.type).u8(wave.loopWords === undefined ? 0 : 1).u16(wave.rate).u16(Math.round(16756991 / wave.rate)).u16(loop).u32(words - loop);
    body.raw(data);
    for (let i = data.length; i < words * 4; i++) body.u8(0);
    at += 12 + words * 4;
  }
  const block = new ByteWriter();
  for (let i = 0; i < 32; i++) block.u8(0);
  block.u32(waves.length);
  for (const o of offsets) block.u32(o);
  block.raw(body.toBytes());
  return nitro("SWAR", "DATA", block.toBytes());
}

export interface NoteDef {
  /** 1 PCM, 2 PSG (wave = duty 0..7), 3 noise. */
  type: 1 | 2 | 3;
  wave?: number;
  archive?: number;
  baseKey?: number;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  pan?: number;
}

export type InstrumentSpec =
  | NoteDef
  | { type: 16; low: number; high: number; notes: NoteDef[] }
  | { type: 17; regions: { top: number; note: NoteDef }[] }
  | { type: 0 };

const noteDef = (w: ByteWriter, n: NoteDef) =>
  w.u16(n.wave ?? 0).u16(n.archive ?? 0).u8(n.baseKey ?? 60).u8(n.attack ?? 127).u8(n.decay ?? 127).u8(n.sustain ?? 127).u8(n.release ?? 127).u8(n.pan ?? 64);

/** A bank: instrument records (type, absolute offset) and their definitions. */
export function buildSbnk(instruments: InstrumentSpec[]): Uint8Array {
  const recordsAt = 16 + 8 + 32 + 4;
  let at = recordsAt + instruments.length * 4;
  const records = new ByteWriter();
  const defs = new ByteWriter();
  for (const inst of instruments) {
    const start = defs.length;
    if (inst.type === 16) {
      defs.u8(inst.low).u8(inst.high);
      for (const n of inst.notes) noteDef(defs.u16(n.type), n);
    } else if (inst.type === 17) {
      for (let i = 0; i < 8; i++) defs.u8(inst.regions[i]?.top ?? 0);
      for (const r of inst.regions) noteDef(defs.u16(r.note.type), r.note);
    } else if (inst.type !== 0) {
      noteDef(defs, inst);
    }
    records.u8(inst.type).u16(inst.type === 0 ? 0 : at).u8(0);
    at += defs.length - start;
  }
  const block = new ByteWriter();
  for (let i = 0; i < 32; i++) block.u8(0);
  block.u32(instruments.length).raw(records.toBytes()).raw(defs.toBytes());
  return nitro("SBNK", "DATA", block.toBytes());
}

export interface SdatSpec {
  seqs?: ({ name?: string; data: Uint8Array; bank: number; volume?: number } | null)[];
  banks?: ({ name?: string; data: Uint8Array; waveArcs: number[] } | null)[];
  waveArcs?: ({ name?: string; data: Uint8Array } | null)[];
}

/** An SDAT with SYMB, INFO, FAT and FILE; records point at files in order of appearance. */
export function buildSdat(spec: SdatSpec): Uint8Array {
  const files: Uint8Array[] = [];
  const add = (data: Uint8Array) => files.push(data) - 1;
  const seqs = (spec.seqs ?? []).map((s) => (s ? { ...s, file: add(s.data) } : null));
  const banks = (spec.banks ?? []).map((b) => (b ? { ...b, file: add(b.data) } : null));
  const waves = (spec.waveArcs ?? []).map((w) => (w ? { ...w, file: add(w.data) } : null));

  // SYMB: 8 list offsets, then lists of string offsets, then strings.
  const lists = [seqs, [], banks, waves, [], [], [], []] as ({ name?: string } | null)[][];
  const symb = new ByteWriter().ascii("SYMB").u32(0);
  const listAt = symb.length;
  for (let i = 0; i < 8; i++) symb.u32(0);
  for (let i = 0; i < 8; i++) symb.u32(0); // reserved
  const strings: [number, string][] = [];
  lists.forEach((list, i) => {
    symb.setU32(listAt + i * 4, symb.length);
    symb.u32(list.length);
    for (const entry of list) {
      const slot = symb.length;
      symb.u32(0);
      if (entry?.name) strings.push([slot, entry.name]);
    }
  });
  for (const [slot, name] of strings) {
    symb.setU32(slot, symb.length);
    symb.ascii(name).u8(0);
  }
  symb.align(4);
  symb.setU32(4, symb.length);

  const info = new ByteWriter().ascii("INFO").u32(0);
  const infoLists = info.length;
  for (let i = 0; i < 8; i++) info.u32(0);
  for (let i = 0; i < 6; i++) info.u32(0);
  const records: ((w: ByteWriter) => void)[][] = [
    seqs.map((s) => (s ? (w: ByteWriter) => w.u16(s.file).u16(0).u16(s.bank).u8(s.volume ?? 127).u8(64).u8(64).u8(0).u16(0) : null)).map((f) => f as never),
    [],
    banks.map((b) => (b ? (w: ByteWriter) => { w.u16(b.file).u16(0); for (let i = 0; i < 4; i++) w.u16(b.waveArcs[i] ?? 0xffff); } : null)).map((f) => f as never),
    waves.map((x) => (x ? (w: ByteWriter) => w.u16(x.file).u16(0) : null)).map((f) => f as never),
    [], [], [], [],
  ];
  records.forEach((list, i) => {
    info.setU32(infoLists + i * 4, info.length);
    info.u32(list.length);
    const slots = list.map(() => {
      const slot = info.length;
      info.u32(0);
      return slot;
    });
    list.forEach((write, k) => {
      if (!write) return;
      info.setU32(slots[k]!, info.length);
      write(info);
    });
  });
  info.align(4);
  info.setU32(4, info.length);

  const header = 0x40;
  const symbAt = header;
  const infoAt = symbAt + symb.length;
  const fatAt = infoAt + info.length;
  const fatSize = 12 + files.length * 16;
  const fileAt = fatAt + fatSize;
  const fileBlock = new ByteWriter().ascii("FILE").u32(0).u32(files.length).u32(0);
  const offsets = files.map((f) => {
    fileBlock.align(32);
    const o = fileAt + fileBlock.length;
    fileBlock.raw(f);
    return o;
  });
  fileBlock.setU32(4, fileBlock.length);
  const fat = new ByteWriter().ascii("FAT ").u32(fatSize).u32(files.length);
  files.forEach((f, i) => fat.u32(offsets[i]!).u32(f.length).u32(0).u32(0));

  const out = new ByteWriter().ascii("SDAT").u16(0xfeff).u16(0x0100).u32(0).u16(header).u16(4);
  for (const [o, s] of [[symbAt, symb.length], [infoAt, info.length], [fatAt, fatSize], [fileAt, fileBlock.length]] as const) out.u32(o).u32(s);
  while (out.length < header) out.u8(0);
  out.raw(symb.toBytes()).raw(info.toBytes()).raw(fat.toBytes()).raw(fileBlock.toBytes());
  out.setU32(8, out.length);
  return out.toBytes();
}

/** One period-exact sine as signed 8-bit PCM: `cycles` cycles over `length` samples. */
export function sine8(length: number, cycles: number, amplitude = 100): number[] {
  return Array.from({ length }, (_, i) => Math.round(amplitude * Math.sin((2 * Math.PI * cycles * i) / length)) & 0xff);
}

/** A variable-length quantity as the sequence format stores it (7 bits per byte, high bit = more). */
export function varlen(value: number): number[] {
  const out = [value & 0x7f];
  for (let v = value >>> 7; v > 0; v >>>= 7) out.unshift((v & 0x7f) | 0x80);
  return out;
}

/** Sequence event helpers. */
export const ev = {
  note: (key: number, velocity: number, length: number) => [key, velocity, ...varlen(length)],
  rest: (ticks: number) => [0x80, ...varlen(ticks)],
  program: (p: number) => [0x81, ...varlen(p)],
  tempo: (bpm: number) => [0xe1, bpm & 255, bpm >> 8],
  openTrack: (track: number, offset: number) => [0x93, track, offset & 255, (offset >> 8) & 255, offset >> 16],
  jump: (offset: number) => [0x94, offset & 255, (offset >> 8) & 255, offset >> 16],
  call: (offset: number) => [0x95, offset & 255, (offset >> 8) & 255, offset >> 16],
  ret: () => [0xfd],
  loopStart: (count: number) => [0xd4, count],
  loopEnd: () => [0xfc],
  allocTracks: (mask: number) => [0xfe, mask & 255, mask >> 8],
  end: () => [0xff],
  volume: (v: number) => [0xc1, v],
  pan: (p: number) => [0xc0, p],
  noteWait: (on: boolean) => [0xc7, on ? 1 : 0],
};
