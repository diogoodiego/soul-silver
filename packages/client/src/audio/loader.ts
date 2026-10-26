import { type AudioIndexFile, cryFile, parseAudioCues, parseAudioFile, type Track, trackByName } from "@soulsilver/shared/audio";
import cuesJson from "../../../../content/audio/cues.json";

// The extracted audio as the renderer sees it (spec 018, T006): the index and the cues once, each
// WAV decoded in a worker and kept. A missing or broken sound is logged and plays nothing (FR-021).

const BASE = "assets://stages/audio/audio";
const MAX_CRIES = 64;

const log = (message: string) => console.warn(`[audio] ${message}`);

const parsedCues = parseAudioCues(cuesJson, "content/audio/cues.json");
if (!parsedCues.ok) log(`${parsedCues.error.file} ${parsedCues.error.path}: ${parsedCues.error.problem}`);
export const cues = parsedCues.ok ? parsedCues.data : undefined;

export const index: Promise<{ byName: Map<string, Track>; byId: Map<number, Track>; cries: AudioIndexFile["cries"] } | undefined> = (async () => {
  try {
    const response = await fetch(`${BASE}/index.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parseAudioFile("audio-index", await response.json(), "audio/index.json");
    if (!parsed.ok) throw new Error(`${parsed.error.path}: ${parsed.error.problem}`);
    return { byName: trackByName(parsed.data), byId: new Map(parsed.data.tracks.map((t) => [t.id, t])), cries: parsed.data.cries };
  } catch (error) {
    log(`No extracted audio; the game plays silent (${(error as Error).message})`);
    return undefined;
  }
})();

let worker: Worker | undefined;
let nextId = 0;
type Pcm = { sampleRate: number; channels: Float32Array[] };
const pending = new Map<number, { file: string; resolve: (result: Pcm | undefined) => void }>();

function decode(bytes: ArrayBuffer, file: string): Promise<Pcm | undefined> {
  if (!worker) {
    worker = new Worker(new URL("./decode-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<Pcm & { id: number; error?: string }>) => {
      const job = pending.get(event.data.id);
      pending.delete(event.data.id);
      if (event.data.error) log(`${job?.file}: ${event.data.error}`);
      job?.resolve(event.data.error ? undefined : event.data);
    };
  }
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { file, resolve });
    worker!.postMessage({ id, bytes }, [bytes]);
  });
}

const buffers = new Map<string, Promise<AudioBuffer | undefined>>();

/** The decoded file, relative to the audio folder; cries are kept only for the last MAX_CRIES. */
export function buffer(ctx: BaseAudioContext, file: string): Promise<AudioBuffer | undefined> {
  let p = buffers.get(file);
  if (p) {
    buffers.delete(file);
    buffers.set(file, p);
    return p;
  }
  p = (async () => {
    try {
      const response = await fetch(`${BASE}/${file}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const pcm = await decode(await response.arrayBuffer(), file);
      if (!pcm) return undefined;
      const out = ctx.createBuffer(pcm.channels.length, pcm.channels[0]!.length, pcm.sampleRate);
      pcm.channels.forEach((c, i) => out.copyToChannel(c as Float32Array<ArrayBuffer>, i));
      return out;
    } catch (error) {
      log(`${file}: ${(error as Error).message}`);
      return undefined;
    }
  })();
  buffers.set(file, p);
  const cries = [...buffers.keys()].filter((k) => k.startsWith("cry/"));
  if (cries.length > MAX_CRIES) buffers.delete(cries[0]!);
  return p;
}

/** The species' cry file; forms the extraction does not have fall back to form 0. */
export async function cryOf(species: number, form = 0): Promise<string | undefined> {
  const cries = (await index)?.cries;
  const c = cries?.find((x) => x.species === species && x.form === form) ?? cries?.find((x) => x.species === species && x.form === 0);
  return c ? cryFile(c.species, c.form) : undefined;
}
