// Render jobs, run in this thread or in worker threads (node:worker_threads), one track or cry each.
// A job's bytes depend only on the job, so the output is the same with any number of workers (R7).
import type { LoopPoints } from "@soulsilver/shared/audio";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parentPort, Worker, workerData } from "node:worker_threads";
import { renderCry } from "./cries.ts";
import { renderSequence, SoundSource } from "./render.ts";
import { readSdat } from "./sdat.ts";
import { encodeWav } from "./wav.ts";

export type Job = { key: string; seq: number } | { key: string; species: number; form: number };

export type JobResult =
  | { key: string; bytes: Uint8Array; channels: 1 | 2; samples: number; loop: LoopPoints | null }
  | { key: string; error: string };

export function renderJob(source: SoundSource, job: Job): JobResult {
  try {
    const track = "seq" in job ? renderSequence(source, job.seq) : renderCry(source, job.species, job.form);
    return { key: job.key, bytes: encodeWav(track.channels), channels: track.channels.length as 1 | 2, samples: track.channels[0]!.length, loop: track.loop };
  } catch (error) {
    return { key: job.key, error: (error as Error).message };
  }
}

/** Renders every job, `workers` at a time (1 = this thread), and hands each result over as it ends. */
export async function renderAll(sdatPath: string, jobs: Job[], workers: number, onResult: (result: JobResult) => Promise<void>, signal?: AbortSignal): Promise<void> {
  if (workers <= 1) {
    const source = new SoundSource(readSdat(new Uint8Array(readFileSync(sdatPath))));
    for (const job of jobs) {
      signal?.throwIfAborted();
      await onResult(renderJob(source, job));
    }
    return;
  }
  const count = Math.min(workers, jobs.length);
  const shares = Array.from({ length: count }, (_, w) => jobs.filter((_, i) => i % count === w));
  const pool = shares.map((share) => new Worker(new URL(import.meta.url), { workerData: { audioWorker: true, sdatPath, jobs: share } }));
  const stop = () => pool.forEach((w) => void w.terminate());
  signal?.addEventListener("abort", stop, { once: true });
  let pending = Promise.resolve();
  try {
    await Promise.all(
      pool.map(
        (worker) =>
          new Promise<void>((resolve, reject) => {
            worker.on("message", (result: JobResult | { done: true }) => {
              if ("done" in result) resolve();
              else pending = pending.then(() => onResult(result));
            });
            worker.on("error", reject);
            worker.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`trabalhador de áudio saiu com código ${code}`))));
          }),
      ),
    );
    await pending;
  } finally {
    signal?.removeEventListener("abort", stop);
    stop();
  }
  signal?.throwIfAborted();
}

/** One worker per core, keeping one core for the rest of the app. */
export const defaultWorkers = () => Math.max(1, availableParallelism() - 1);

if (parentPort && (workerData as { audioWorker?: boolean } | null)?.audioWorker) {
  const { sdatPath, jobs } = workerData as { sdatPath: string; jobs: Job[] };
  const source = new SoundSource(readSdat(new Uint8Array(readFileSync(sdatPath))));
  for (const job of jobs) {
    const result = renderJob(source, job);
    parentPort.postMessage(result, "bytes" in result ? [result.bytes.buffer as ArrayBuffer] : []);
  }
  parentPort.postMessage({ done: true });
}
