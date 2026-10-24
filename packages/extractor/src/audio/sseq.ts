// Sequence (SSEQ) reading and the track interpreter of the Nitro sequencer: one call to
// `stepTrack` runs a track's commands for one tick. Channels live in synth.ts; the interpreter
// reaches them through `TrackHost`. See research.md R2 and R3.
import type { Sdat } from "./sdat.ts";
import { nitroData, SdatFormatError } from "./sdat.ts";

/** Commands whose argument is one byte (0xC0..0xD6, except 0xD4 which is also one byte). */
const BYTE_ARG = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6]);
/** Commands whose argument is a signed or unsigned 16-bit value. */
const SHORT_ARG = new Set([0xe0, 0xe1, 0xe3]);

/** The events of a sequence file: the bytes from the start of its data, where offsets count from. */
export function sequenceData(file: Uint8Array, what: string): Uint8Array {
  const data = nitroData(file, "SSEQ", what);
  const start = file[data + 8]! | (file[data + 9]! << 8) | (file[data + 10]! << 16);
  if (start >= file.length) throw new SdatFormatError(`${what}: início dos eventos fora do arquivo`);
  return file.subarray(start);
}

export interface TrackHost {
  /** Starts a note. `length` 0 means the note is not released by time (it plays until its wave ends). */
  noteOn(track: Track, key: number, velocity: number, length: number): void;
  /** Opens another track at an offset of the sequence. */
  openTrack(index: number, offset: number): void;
  /** Called when a track jumps back to code it already ran: the sequence repeats from there. */
  loopedBack(track: Track, target: number): void;
  setTempo(bpm: number): void;
  setMainVolume(volume: number): void;
  /** Player variables 0..15 and global variables 16..31. */
  variables: Int16Array;
  /** Output sample of the current tick. */
  readonly now: number;
  random(): number;
}

/** The state of one track, with the defaults of the Nitro sequencer. */
export class Track {
  pos: number;
  wait = 0;
  ended = false;
  noteWait = true;
  tie = false;
  program = 0;
  volume = 127;
  expression = 127;
  /** -64..63, 0 = center. */
  pan = 0;
  transpose = 0;
  bend = 0;
  bendRange = 2;
  priority = 64;
  /** 0xFF: use the instrument's value. */
  attack = 0xff;
  decay = 0xff;
  sustain = 0xff;
  release = 0xff;
  portamento = false;
  portaKey = 60;
  portaTime = 0;
  sweepPitch = 0;
  mod = { depth: 0, speed: 16, type: 0, range: 1, delay: 0 };
  compare = true;
  calls: { pos: number; loopAt?: number; count?: number }[] = [];
  /** Offsets this track has already run, with the output sample where each first ran: a jump back to one of them is the sequence's loop. */
  readonly seen = new Map<number, number>();

  readonly index: number;

  constructor(index: number, start: number) {
    this.index = index;
    this.pos = start;
  }
}

/** Runs one tick of a track: counts its wait down, then runs commands until it has to wait again. */
export function stepTrack(data: Uint8Array, track: Track, host: TrackHost): void {
  if (track.ended) return;
  if (track.wait > 0) {
    track.wait--;
    if (track.wait > 0) return;
  }
  let guard = 0;
  while (!track.ended && track.wait === 0) {
    if (++guard > 100000) throw new SdatFormatError(`faixa ${track.index}: laço sem espera na posição 0x${track.pos.toString(16)}`);
    runCommand(data, track, host);
  }
}

function varlen(data: Uint8Array, track: Track): number {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const byte = data[track.pos++];
    if (byte === undefined) throw new SdatFormatError(`faixa ${track.index}: comando cortado no fim da sequência`);
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  return value;
}

const u8 = (data: Uint8Array, track: Track) => {
  const byte = data[track.pos++];
  if (byte === undefined) throw new SdatFormatError(`faixa ${track.index}: comando cortado no fim da sequência`);
  return byte;
};
const s16 = (data: Uint8Array, track: Track) => {
  const v = u8(data, track) | (u8(data, track) << 8);
  return (v << 16) >> 16;
};
const u24 = (data: Uint8Array, track: Track) => u8(data, track) | (u8(data, track) << 8) | (u8(data, track) << 16);

type ArgOverride = { kind: "random"; min: number; max: number } | { kind: "variable"; index: number } | null;

function runCommand(data: Uint8Array, track: Track, host: TrackHost): void {
  const at = track.pos;
  if (!track.seen.has(at)) track.seen.set(at, host.now);
  let op = u8(data, track);
  let execute = true;

  if (op === 0xa2) {
    execute = track.compare;
    op = u8(data, track);
  }
  if (op === 0xa0 || op === 0xa1) {
    const prefix = op;
    op = u8(data, track);
    // The last argument of `op` is replaced: by a random value in [min, max] or by a variable.
    const before = op < 0x80 ? 1 : op >= 0xb0 && op <= 0xbd ? 1 : 0;
    const head = Array.from({ length: before }, () => u8(data, track));
    const override: ArgOverride = prefix === 0xa0 ? { kind: "random", min: s16(data, track), max: s16(data, track) } : { kind: "variable", index: u8(data, track) };
    if (execute) apply(op, head, override, data, track, host);
    return;
  }
  if (!execute) {
    skipArgs(op, data, track);
    return;
  }
  apply(op, [], null, data, track, host);
}

/** Reads the arguments of a command without running it (the false branch of 0xA2). */
function skipArgs(op: number, data: Uint8Array, track: Track): void {
  if (op < 0x80) {
    u8(data, track);
    varlen(data, track);
  } else if (op === 0x80 || op === 0x81) varlen(data, track);
  else if (op === 0x93) track.pos += 4;
  else if (op === 0x94 || op === 0x95) track.pos += 3;
  else if (op >= 0xb0 && op <= 0xbd) track.pos += 3;
  else if (BYTE_ARG.has(op)) track.pos += 1;
  else if (SHORT_ARG.has(op)) track.pos += 2;
  else if (op === 0xfe) track.pos += 2;
  else if (op !== 0xfc && op !== 0xfd && op !== 0xff) throw new SdatFormatError(`faixa ${track.index}: comando 0x${op.toString(16)} desconhecido na posição 0x${(track.pos - 1).toString(16)}`);
}

function apply(op: number, head: number[], override: ArgOverride, data: Uint8Array, track: Track, host: TrackHost): void {
  const last = (read: () => number): number => {
    if (!override) return read();
    if (override.kind === "variable") return host.variables[override.index] ?? 0;
    return override.min + Math.floor((host.random() * (override.max - override.min + 1)) / 0x10000);
  };

  if (op < 0x80) {
    const velocity = head[0] ?? u8(data, track);
    const length = last(() => varlen(data, track));
    host.noteOn(track, op + track.transpose, velocity, length);
    if (track.noteWait) track.wait = length;
    return;
  }
  if (op >= 0xb0 && op <= 0xbd) {
    const index = head[0] ?? u8(data, track);
    const value = last(() => s16(data, track));
    variableOp(op, index, value, track, host);
    return;
  }
  if (BYTE_ARG.has(op)) {
    const raw = last(() => u8(data, track));
    byteCommand(op, raw, track, host);
    return;
  }
  if (SHORT_ARG.has(op)) {
    const value = last(() => s16(data, track));
    if (op === 0xe0) track.mod.delay = value;
    else if (op === 0xe1) host.setTempo(value & 0xffff);
    else track.sweepPitch = value;
    return;
  }
  switch (op) {
    case 0x80:
      track.wait = last(() => varlen(data, track));
      return;
    case 0x81:
      track.program = last(() => varlen(data, track));
      return;
    case 0x93: {
      const index = u8(data, track);
      host.openTrack(index, u24(data, track));
      return;
    }
    case 0x94: {
      const target = u24(data, track);
      if (track.seen.has(target)) host.loopedBack(track, target);
      track.pos = target;
      return;
    }
    case 0x95: {
      const target = u24(data, track);
      if (track.calls.length >= 3) throw new SdatFormatError(`faixa ${track.index}: chamadas aninhadas demais`);
      track.calls.push({ pos: track.pos });
      track.pos = target;
      return;
    }
    case 0xfc: {
      const frame = track.calls.findLast((c) => c.loopAt !== undefined);
      if (!frame) return;
      if (frame.count === 0) {
        // An endless loop: the sequence repeats from the loop start.
        if (track.seen.has(frame.loopAt!)) host.loopedBack(track, frame.loopAt!);
        track.pos = frame.loopAt!;
        return;
      }
      frame.count!--;
      if (frame.count! > 0) track.pos = frame.loopAt!;
      else track.calls.splice(track.calls.lastIndexOf(frame), 1);
      return;
    }
    case 0xfd: {
      // Returns to the innermost call; a return with no call is ignored, as in the original.
      const i = track.calls.findLastIndex((c) => c.loopAt === undefined);
      if (i < 0) return;
      track.pos = track.calls[i]!.pos;
      track.calls.length = i;
      return;
    }
    case 0xfe:
      track.pos += 2;
      return;
    case 0xff:
      track.ended = true;
      return;
    default:
      throw new SdatFormatError(`faixa ${track.index}: comando 0x${op.toString(16)} desconhecido na posição 0x${(track.pos - 1).toString(16)}`);
  }
}

function byteCommand(op: number, raw: number, track: Track, host: TrackHost): void {
  const signed = (raw << 24) >> 24;
  switch (op) {
    case 0xc0: track.pan = raw - 64; break;
    case 0xc1: track.volume = raw; break;
    case 0xc2: host.setMainVolume(raw); break;
    case 0xc3: track.transpose = signed; break;
    case 0xc4: track.bend = signed; break;
    case 0xc5: track.bendRange = raw; break;
    case 0xc6: track.priority = raw; break;
    case 0xc7: track.noteWait = raw !== 0; break;
    case 0xc8: track.tie = raw !== 0; break;
    case 0xc9: track.portaKey = raw + track.transpose; track.portamento = true; break;
    case 0xca: track.mod.depth = raw; break;
    case 0xcb: track.mod.speed = raw; break;
    case 0xcc: track.mod.type = raw; break;
    case 0xcd: track.mod.range = raw; break;
    case 0xce: track.portamento = raw !== 0; break;
    case 0xcf: track.portaTime = raw; break;
    case 0xd0: track.attack = raw; break;
    case 0xd1: track.decay = raw; break;
    case 0xd2: track.sustain = raw; break;
    case 0xd3: track.release = raw; break;
    case 0xd4: track.calls.push({ pos: track.pos, loopAt: track.pos, count: raw }); break;
    case 0xd5: track.expression = raw; break;
    case 0xd6: break; // print variable: a debug command
  }
}

function variableOp(op: number, index: number, value: number, track: Track, host: TrackHost): void {
  const vars = host.variables;
  const current = vars[index] ?? 0;
  switch (op) {
    case 0xb0: vars[index] = value; break;
    case 0xb1: vars[index] = current + value; break;
    case 0xb2: vars[index] = current - value; break;
    case 0xb3: vars[index] = current * value; break;
    case 0xb4: if (value !== 0) vars[index] = Math.trunc(current / value); break;
    case 0xb5: vars[index] = value >= 0 ? current << value : current >> -value; break;
    case 0xb6: vars[index] = value < 0 ? -Math.floor((host.random() * (1 - value)) / 0x10000) : Math.floor((host.random() * (value + 1)) / 0x10000); break;
    case 0xb7: break;
    case 0xb8: track.compare = current === value; break;
    case 0xb9: track.compare = current >= value; break;
    case 0xba: track.compare = current > value; break;
    case 0xbb: track.compare = current <= value; break;
    case 0xbc: track.compare = current < value; break;
    case 0xbd: track.compare = current !== value; break;
  }
}

/** Every command each sequence's tracks can reach, by opcode; reading problems by sequence (R0 probe). */
export function commandCensus(sdat: Sdat): { commands: Map<number, number>; problems: string[]; read: number } {
  const commands = new Map<number, number>();
  const problems: string[] = [];
  let read = 0;
  for (const seq of sdat.seqs) {
    if (!seq) continue;
    try {
      const data = sequenceData(sdat.file(seq.fileId), `sequência ${seq.id}`);
      const starts = [0];
      const visited = new Set<number>();
      while (starts.length > 0) {
        let pos = starts.pop()!;
        while (pos < data.length && !visited.has(pos)) {
          visited.add(pos);
          const op0 = data[pos]!;
          const t = new Track(0, pos);
          let op = op0;
          t.pos++;
          if (op === 0xa2) op = data[t.pos++]!;
          if (op === 0xa0 || op === 0xa1) {
            const prefix = op;
            op = data[t.pos++]!;
            t.pos += (op < 0x80 || (op >= 0xb0 && op <= 0xbd) ? 1 : 0) + (prefix === 0xa0 ? 4 : 1);
          } else {
            if (op === 0x93) starts.push(data[t.pos + 1]! | (data[t.pos + 2]! << 8) | (data[t.pos + 3]! << 16));
            if (op === 0x94 || op === 0x95) starts.push(data[t.pos]! | (data[t.pos + 1]! << 8) | (data[t.pos + 2]! << 16));
            skipArgs(op, data, t);
          }
          commands.set(op, (commands.get(op) ?? 0) + 1);
          pos = t.pos;
          if (op === 0x94 || op === 0xff || (op === 0xfd && op0 !== 0xa2)) break;
        }
      }
      read++;
    } catch (error) {
      problems.push(`sequência ${seq.id}: ${(error as Error).message}`);
    }
  }
  return { commands, problems, read };
}
