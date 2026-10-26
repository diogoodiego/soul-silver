import { admitVoice, type Listener, mixSound, type SoundRequest } from "@soulsilver/shared/audio";
import type { AppSettings } from "@soulsilver/shared";
import { buffer, cryOf, cues, index } from "./loader";

// Plays music and effects (spec 018, contracts/audio-cues.md): master → music | effects buses,
// crossfade between two music gains, and a capped set of effect voices. Without an audio device
// every call does nothing.

const ctx = (() => {
  try {
    return new AudioContext();
  } catch (error) {
    console.warn(`[audio] No audio device: ${(error as Error).message}`);
    return undefined;
  }
})();

function bus(to: AudioNode | undefined): GainNode | undefined {
  if (!ctx || !to) return undefined;
  const g = ctx.createGain();
  g.connect(to);
  return g;
}
const master = bus(ctx?.destination);
const musicBus = bus(master);
const effectsBus = bus(master);

let volumes: AppSettings["audio"] = { master: 80, music: 80, effects: 80, muteUnfocused: false };
let focused = document.hasFocus();
function applyVolumes(): void {
  if (!ctx || !master || !musicBus || !effectsBus) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(volumes.muteUnfocused && !focused ? 0 : volumes.master / 100, t, 0.02);
  musicBus.gain.setTargetAtTime(volumes.music / 100, t, 0.02);
  effectsBus.gain.setTargetAtTime(volumes.effects / 100, t, 0.02);
}
window.addEventListener("blur", () => {
  focused = false;
  applyVolumes();
});
window.addEventListener("focus", () => {
  focused = true;
  applyVolumes();
});

interface Playing {
  id: number;
  src?: AudioBufferSourceNode;
  gain?: GainNode;
}
let music: Playing | undefined;
let fading: Playing | undefined;

function fadeOut(p: Playing | undefined, seconds: number): void {
  if (!ctx || !p?.gain || !p.src) return;
  const t = ctx.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + seconds);
  p.src.onended = null;
  p.src.stop(t + seconds);
}

let listener: Listener = { x: 0, y: 0, halfWidthPx: 1 };
const voices: { src: AudioBufferSourceNode; priority: number; gain: number }[] = [];

export const audio = {
  /** For the F3 overlay. */
  stats(): { music: number | null; voices: number; state: string } {
    return { music: music?.id ?? null, voices: voices.length, state: ctx?.state ?? "none" };
  },

  setVolumes(next: AppSettings["audio"]): void {
    volumes = next;
    applyVolumes();
  },

  setListener(next: Listener): void {
    listener = next;
  },

  /**
   * Crossfades to the track; the same track keeps playing. `once` plays up to the loop end and
   * calls `onEnded` (the victory fanfare, which loops in the original).
   */
  async setMusic(id: number | null, options: { once?: boolean; onEnded?: () => void } = {}): Promise<void> {
    if (!ctx || !musicBus || (music?.id ?? null) === id) return;
    const seconds = (cues?.mix.crossfadeMs ?? 800) / 1000;
    // A change during a crossfade: the track already leaving stops now.
    if (fading?.src) fading.src.stop();
    fadeOut(music, seconds);
    fading = music;
    if (id === null) {
      music = undefined;
      return;
    }
    const mine: Playing = { id };
    music = mine;
    const track = (await index)?.byId.get(id);
    const buf = track && (await buffer(ctx, track.file));
    if (!buf || music !== mine) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + seconds);
    src.connect(gain).connect(musicBus);
    const loop = track.loop;
    if (options.once) {
      src.onended = () => music === mine && options.onEnded?.();
      src.start(0, 0, (loop?.end ?? track.samples) / buf.sampleRate);
    } else {
      if (loop) {
        src.loop = true;
        src.loopStart = loop.start / buf.sampleRate;
        src.loopEnd = loop.end / buf.sampleRate;
      }
      src.start();
    }
    mine.src = src;
    mine.gain = gain;
  },

  /** An effect cue, or a track by name. */
  async play(name: string, req: SoundRequest & { rate?: number }): Promise<void> {
    const trackName = (cues?.effects as Record<string, string> | undefined)?.[name] ?? name;
    const track = (await index)?.byName.get(trackName);
    if (!track) {
      console.warn(`[audio] No track "${trackName}"`);
      return;
    }
    await voice(track.file, req);
  },

  async cry(species: number, req: SoundRequest & { rate?: number }): Promise<void> {
    const file = await cryOf(species);
    if (file) await voice(file, req);
  },

  /** Loads and decodes ahead, so playing never waits (FR-019). */
  async preload(names: (string | number)[]): Promise<void> {
    if (!ctx) return;
    const i = await index;
    await Promise.all(
      names.map((n) => {
        const track = typeof n === "number" ? i?.byId.get(n) : i?.byName.get((cues?.effects as Record<string, string> | undefined)?.[n] ?? n);
        return track && buffer(ctx, track.file);
      }),
    );
  },

  async preloadCry(species: number): Promise<void> {
    const file = await cryOf(species);
    if (ctx && file) await buffer(ctx, file);
  },
};

async function voice(file: string, req: SoundRequest & { rate?: number }): Promise<void> {
  if (!ctx || !effectsBus) return;
  const mix = mixSound(req, listener, (cues?.mix.rangeTiles ?? 12) * 16);
  if (!mix) return;
  const buf = await buffer(ctx, file);
  if (!buf) return;
  const slot = admitVoice(voices, mix, cues?.mix.maxVoices ?? 16);
  if (slot === "drop") return;
  if (slot !== "free") {
    voices[slot]!.src.onended = null;
    voices[slot]!.src.stop();
    voices.splice(slot, 1);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = req.rate ?? 1;
  const gain = ctx.createGain();
  gain.gain.value = mix.gain;
  const pan = ctx.createStereoPanner();
  pan.pan.value = mix.pan;
  src.connect(gain).connect(pan).connect(effectsBus);
  const v = { src, priority: mix.priority, gain: mix.gain };
  voices.push(v);
  src.onended = () => {
    const at = voices.indexOf(v);
    if (at >= 0) voices.splice(at, 1);
  };
  src.start();
}
