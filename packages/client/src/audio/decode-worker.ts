import { decodeWav } from "@soulsilver/shared/audio";

// Decodes the extracted WAVs off the main thread, so loading a track never costs a frame (FR-020).

self.onmessage = (event: MessageEvent<{ id: number; bytes: ArrayBuffer }>) => {
  const { id, bytes } = event.data;
  try {
    const { sampleRate, channels } = decodeWav(new Uint8Array(bytes));
    self.postMessage({ id, sampleRate, channels }, { transfer: channels.map((c) => c.buffer as ArrayBuffer) });
  } catch (error) {
    self.postMessage({ id, error: (error as Error).message });
  }
};
