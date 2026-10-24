// The Nitro sound engine, offline: a player runs the tracks of a sequence on ticks driven by the
// tempo, 16 channels play PCM waves, square waves (PSG) and noise with the engine's envelope, LFO,
// sweep, volume and pan, and the output is mixed in stereo at 32 kHz. See research.md R2.
import { AUDIO_SAMPLE_RATE } from "@soulsilver/shared/audio";
import { noteForKey, type Instrument, type NoteDefinition } from "./sbnk.ts";
import { sequenceData, stepTrack, Track, type TrackHost } from "./sseq.ts";
import type { Wave } from "./swar.ts";
import { amplitude, attackRate, decibelSquare, ENV_MIN, fallRate, lfoSine, MIN_CB, sustainLevel } from "./tables.ts";

/** The engine updates sequences and channels about 192 times a second (2728 × 64 cycles of 33.513982 MHz). */
export const FRAME_RATE = 33513982 / (2728 * 64);

const CHANNELS = 16;
const PSG_CHANNELS = [8, 9, 10, 11, 12, 13];
const NOISE_CHANNELS = [14, 15];
/** One tick each time the tempo counter passes 240. */
const TEMPO_STEP = 240;
/** Square wave and noise play at 440 Hz at their base key. */
const PSG_BASE_HZ = 440;

/** What a player needs from the sound archive: a bank's instruments and the waves of its archives. */
export interface Instruments {
  bank: (Instrument | null)[];
  /** Wave archives by the bank's slot (0..3). */
  waves: (Wave[] | null)[];
  bankId: number;
}

const Env = { Attack: 0, Decay: 1, Sustain: 2, Release: 3 } as const;
type Env = (typeof Env)[keyof typeof Env];

interface Channel {
  active: boolean;
  track: Track;
  priority: number;
  kind: NoteDefinition["kind"];
  wave: Wave | null;
  duty: number;
  lfsr: number;
  /** PCM: position in the wave; PSG and noise: phase in cycles. */
  pos: number;
  key: number;
  baseKey: number;
  velocity: number;
  pan: number;
  /** Ticks left before release; -1 = released by the wave's end only. */
  length: number;
  env: number;
  state: Env;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  sweepPitch: number;
  sweepLength: number;
  sweepCounter: number;
  modCounter: number;
  modDelay: number;
  /** Values for the current frame. */
  step: number;
  left: number;
  right: number;
}

export interface LoopFound {
  track: number;
  /** Output samples: where the repeated part first started, and where the track jumped back. */
  start: number;
  end: number;
}

export class Player implements TrackHost {
  readonly variables = new Int16Array(32).fill(-1);
  now = 0;
  readonly loops: LoopFound[] = [];
  private readonly data: Uint8Array;
  private readonly tracks: Track[] = [];
  private readonly channels: Channel[] = [];
  private tempo = 120;
  private tempoCounter = TEMPO_STEP;
  private mainVolume = 127;
  private seed = 0x12345678;
  private frame = 0;

  private readonly instruments: Instruments;
  /** The sequence's own volume (from the archive's records). */
  private readonly volume: number;

  constructor(sequence: Uint8Array, instruments: Instruments, volume: number, what: string) {
    this.instruments = instruments;
    this.volume = volume;
    this.data = sequenceData(sequence, what);
    this.tracks.push(new Track(0, 0));
  }

  /** True once every track ended and every channel went silent. */
  get done(): boolean {
    return this.tracks.every((t) => t.ended) && this.channels.every((c) => !c.active);
  }

  /** Renders one engine frame into `left` and `right` from sample `this.now` (they must have room); returns the samples written. */
  renderFrame(left: Float32Array, right: Float32Array): number {
    this.tempoCounter += this.tempo;
    while (this.tempoCounter >= TEMPO_STEP) {
      this.tempoCounter -= TEMPO_STEP;
      this.tick();
    }
    for (const c of this.channels) if (c.active) this.updateChannel(c);

    this.frame++;
    const end = Math.round((this.frame * AUDIO_SAMPLE_RATE) / FRAME_RATE);
    const count = end - this.now;
    for (const c of this.channels) if (c.active) this.mix(c, left, right, count);
    this.now = end;
    return count;
  }

  private tick(): void {
    for (const c of this.channels) {
      if (c.active && c.state !== Env.Release && c.length > 0 && --c.length === 0) c.state = Env.Release;
    }
    // Tracks opened during this tick run from the next one, as in the engine.
    for (const track of [...this.tracks]) stepTrack(this.data, track, this);
  }

  // TrackHost

  openTrack(index: number, offset: number): void {
    this.tracks.push(new Track(index, offset));
  }

  loopedBack(track: Track, target: number): void {
    if (this.loops.some((l) => l.track === track.index)) return;
    this.loops.push({ track: track.index, start: track.seen.get(target) ?? 0, end: this.now });
  }

  setTempo(bpm: number): void {
    this.tempo = bpm;
  }

  setMainVolume(volume: number): void {
    this.mainVolume = volume;
  }

  random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed >>> 16;
  }

  noteOn(track: Track, key: number, velocity: number, length: number): void {
    const instrument = this.instruments.bank[track.program];
    if (!instrument) return; // an empty program is silent in the original too
    const def = noteForKey(instrument, key);
    if (!def) return;
    let wave: Wave | null = null;
    if (def.kind === "pcm") {
      wave = this.instruments.waves[def.archive]?.[def.wave] ?? null;
      if (!wave) throw new Error(`banco ${this.instruments.bankId}, instrumento ${track.program}: onda ${def.wave} do arquivo ${def.archive} ausente`);
    }
    const channel = this.allocate(def.kind, track.priority);
    if (!channel) return;
    const sweep = track.sweepPitch + (track.portamento ? (track.portaKey - key) * 64 : 0);
    Object.assign(channel, {
      active: true,
      track,
      priority: track.priority,
      kind: def.kind,
      wave,
      duty: def.wave & 7,
      lfsr: 0x7fff,
      pos: 0,
      key,
      baseKey: def.baseKey,
      velocity,
      pan: def.pan - 64,
      length: length === 0 ? -1 : length,
      env: ENV_MIN,
      state: Env.Attack,
      attack: attackRate(track.attack !== 0xff ? track.attack : def.attack),
      decay: fallRate(track.decay !== 0xff ? track.decay : def.decay),
      sustain: sustainLevel(track.sustain !== 0xff ? track.sustain : def.sustain),
      release: fallRate(track.release !== 0xff ? track.release : def.release),
      sweepPitch: sweep,
      sweepLength: sweep === 0 ? 0 : track.portaTime > 0 ? Math.max(1, (track.portaTime * track.portaTime * Math.abs(sweep)) >> 11) : Math.max(1, length),
      sweepCounter: 0,
      modCounter: 0,
      modDelay: 0,
    } satisfies Partial<Channel>);
    if (track.portamento) track.portaKey = key;
  }

  /** A free channel of the right kind, or the lowest-priority one at or below `priority` (quietest first). */
  private allocate(kind: NoteDefinition["kind"], priority: number): Channel | null {
    const allowed = kind === "psg" ? PSG_CHANNELS : kind === "noise" ? NOISE_CHANNELS : Array.from({ length: CHANNELS }, (_, i) => i);
    while (this.channels.length < CHANNELS) this.channels.push({ active: false } as Channel);
    let best: Channel | null = null;
    for (const i of allowed) {
      const c = this.channels[i]!;
      if (!c.active) return c;
      if (c.priority > priority) continue;
      if (!best || c.priority < best.priority || (c.priority === best.priority && c.env < best.env)) best = c;
    }
    return best;
  }

  private updateChannel(c: Channel): void {
    // Envelope.
    if (c.state === Env.Attack) {
      c.env = -Math.floor((-c.env * c.attack) / 256);
      if (c.env >= 0) {
        c.env = 0;
        c.state = Env.Decay;
      }
    } else if (c.state === Env.Decay) {
      c.env -= c.decay;
      if (c.env <= c.sustain) {
        c.env = c.sustain;
        c.state = Env.Sustain;
      }
    } else if (c.state === Env.Release) {
      c.env -= c.release;
      if (c.env <= ENV_MIN) {
        c.active = false;
        return;
      }
    }

    // LFO.
    const t = c.track;
    let lfo = 0;
    if (t.mod.depth > 0) {
      if (c.modDelay < t.mod.delay) c.modDelay++;
      else {
        c.modCounter = (c.modCounter + (t.mod.speed << 6)) & 0x7fff;
        lfo = lfoSine(c.modCounter >> 8) * t.mod.depth * t.mod.range;
      }
    }

    // Sweep (portamento and sweep pitch).
    let sweep = 0;
    if (c.sweepLength > 0 && c.sweepCounter < c.sweepLength) {
      sweep = (c.sweepPitch * (c.sweepLength - c.sweepCounter)) / c.sweepLength;
      c.sweepCounter++;
    }

    // Pitch in 1/64 semitone.
    const pitch = (c.key - c.baseKey) * 64 + ((t.bend * t.bendRange) >> 1) + sweep + (t.mod.type === 0 ? lfo >> 8 : 0);
    const ratio = 2 ** (pitch / 768);
    if (c.kind === "pcm") c.step = (c.wave!.rate * ratio) / AUDIO_SAMPLE_RATE;
    else c.step = (PSG_BASE_HZ * ratio * (c.kind === "noise" ? 8 : 1)) / AUDIO_SAMPLE_RATE;

    // Volume (centibels) and pan.
    let cb = decibelSquare(c.velocity) + decibelSquare(t.volume) + decibelSquare(t.expression) + decibelSquare(this.volume) + decibelSquare(this.mainVolume) + (c.env >> 7);
    if (t.mod.type === 1) cb += (lfo * 60) >> 14;
    const gain = amplitude(Math.max(MIN_CB, cb));
    const pan = Math.max(-64, Math.min(63, c.pan + t.pan + (t.mod.type === 2 ? lfo >> 8 : 0))) + 64;
    c.left = (gain * (128 - pan)) / 128;
    c.right = (gain * pan) / 128;
  }

  private mix(c: Channel, left: Float32Array, right: Float32Array, count: number): void {
    const base = this.now;
    for (let i = 0; i < count; i++) {
      let s: number;
      if (c.kind === "pcm") {
        const wave = c.wave!;
        const length = wave.samples.length;
        if (c.pos >= length) {
          if (wave.loopStart === null) {
            c.active = false;
            return;
          }
          c.pos = wave.loopStart + ((c.pos - wave.loopStart) % (length - wave.loopStart));
        }
        const at = Math.floor(c.pos);
        const frac = c.pos - at;
        const next = at + 1 < length ? wave.samples[at + 1]! : wave.loopStart !== null ? wave.samples[wave.loopStart]! : 0;
        s = wave.samples[at]! * (1 - frac) + next * frac;
      } else if (c.kind === "psg") {
        s = (c.pos % 1) * 8 < c.duty + 1 ? 1 : -1;
      } else {
        const before = Math.floor(c.pos);
        const after = Math.floor(c.pos + c.step);
        for (let k = before; k < after; k++) {
          const bit = c.lfsr & 1;
          c.lfsr >>= 1;
          if (bit) c.lfsr ^= 0x6000;
        }
        s = c.lfsr & 1 ? -1 : 1;
      }
      left[base + i] = left[base + i]! + s * c.left;
      right[base + i] = right[base + i]! + s * c.right;
      c.pos += c.step;
    }
  }
}
