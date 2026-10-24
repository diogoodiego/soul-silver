// Render of one sequence to PCM: until it ends (cutting the silence after the last note), or,
// for a sequence that repeats, the introduction and one turn of the loop taken from the second
// pass, so the notes still ringing from the end of the loop are at its start. See research.md R3.
import type { LoopPoints } from "@soulsilver/shared/audio";
import { AUDIO_SAMPLE_RATE } from "@soulsilver/shared/audio";
import { readSbnk } from "./sbnk.ts";
import type { Sdat } from "./sdat.ts";
import { readSwar, type Wave } from "./swar.ts";
import { Player, type Instruments } from "./synth.ts";

export interface RenderedTrack {
  /** One array per channel: 1 when left and right are identical, else 2. */
  channels: Float32Array[];
  loop: LoopPoints | null;
}

/** Longest a sequence may play before it either ends or repeats. */
export const MAX_SECONDS = 600;

/** Below this a sample counts as silence when cutting the end of a sequence that does not repeat. */
const SILENCE = 1 / 65536;

/** Banks and wave archives of a sound archive, read once each. */
export class SoundSource {
  readonly sdat: Sdat;
  private readonly banks = new Map<number, Instruments>();
  private readonly waveArcs = new Map<number, Wave[]>();

  constructor(sdat: Sdat) {
    this.sdat = sdat;
  }

  instruments(bankId: number): Instruments {
    let found = this.banks.get(bankId);
    if (!found) {
      const info = this.sdat.banks[bankId];
      if (!info) throw new Error(`banco ${bankId} ausente no arquivo de som`);
      found = {
        bankId,
        bank: readSbnk(this.sdat.file(info.fileId), `banco ${bankId}`),
        waves: info.waveArcs.map((arc) => this.waves(arc)),
      };
      this.banks.set(bankId, found);
    }
    return found;
  }

  private waves(arc: number): Wave[] | null {
    const fileId = this.sdat.waveArcs[arc];
    if (fileId === null || fileId === undefined) return null;
    let found = this.waveArcs.get(arc);
    if (!found) {
      found = readSwar(this.sdat.file(fileId), `arquivo de ondas ${arc}`);
      this.waveArcs.set(arc, found);
    }
    return found;
  }
}

class Buffer2 {
  left = new Float32Array(1 << 16);
  right = new Float32Array(1 << 16);

  ensure(size: number): void {
    if (size <= this.left.length) return;
    let capacity = this.left.length;
    while (capacity < size) capacity *= 2;
    for (const side of ["left", "right"] as const) {
      const next = new Float32Array(capacity);
      next.set(this[side]);
      this[side] = next;
    }
  }
}

/** Renders sequence `seqId`, with its own bank or `bank` (cries use one sequence with each species' bank). */
export function renderSequence(source: SoundSource, seqId: number, bank?: number): RenderedTrack {
  const info = source.sdat.seqs[seqId];
  if (!info) throw new Error(`sequência ${seqId} ausente no arquivo de som`);
  const player = new Player(source.sdat.file(info.fileId), source.instruments(bank ?? info.bank), info.volume, `sequência ${seqId}`);
  const out = new Buffer2();
  const limit = MAX_SECONDS * AUDIO_SAMPLE_RATE;
  let loop: LoopPoints | null = null;

  for (;;) {
    out.ensure(player.now + 1024);
    player.renderFrame(out.left, out.right);
    const last = player.loops.reduce<(typeof player.loops)[number] | null>((best, l) => (l.end > l.start && (!best || l.end > best.end) ? l : best), null);
    if (last) loop = { start: last.start, end: last.end };
    if (loop ? player.now >= 2 * loop.end - loop.start : player.done) break;
    if (player.now > limit) throw new Error(`sequência ${seqId}: não termina nem repete em ${MAX_SECONDS} s`);
  }

  const take = (side: Float32Array): Float32Array => {
    if (!loop) return side.slice(0, length);
    const turn = loop.end - loop.start;
    const result = new Float32Array(loop.end);
    result.set(side.subarray(0, loop.start));
    result.set(side.subarray(loop.end, loop.end + turn), loop.start);
    return result;
  };
  let length = player.now;
  if (!loop) {
    while (length > 1 && Math.abs(out.left[length - 1]!) < SILENCE && Math.abs(out.right[length - 1]!) < SILENCE) length--;
  }
  const left = take(out.left);
  const right = take(out.right);
  const mono = left.every((v, i) => v === right[i]);
  return { channels: mono ? [left] : [left, right], loop };
}
