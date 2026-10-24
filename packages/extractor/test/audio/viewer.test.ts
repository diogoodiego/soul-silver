import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startViewer, type Viewer } from "../../src/viewer/serve.ts";

let root: string;
let viewer: Viewer;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ss-audio-viewer-"));
  await mkdir(join(root, "audio", "music"), { recursive: true });
  await writeFile(join(root, "audio", "index.json"), "{}\n");
  await writeFile(join(root, "audio", "music", "1018.wav"), new Uint8Array([0x52, 0x49, 0x46, 0x46]));
  viewer = await startViewer({ mapsDir: join(root, "audio"), port: 0, html: await readFile(new URL("../../src/viewer/audio.html", import.meta.url), "utf8") });
});

afterEach(async () => {
  await viewer.close();
  await rm(root, { recursive: true, force: true });
});

describe("audio player", () => {
  it("serves the page, the index and the WAVs as audio/wav, read-only", async () => {
    const base = `http://127.0.0.1:${viewer.port}`;
    expect(await (await fetch(`${base}/`)).text()).toContain("<title>Áudio</title>");
    expect((await fetch(`${base}/data/index.json`)).status).toBe(200);
    expect((await fetch(`${base}/data/music/1018.wav`)).headers.get("content-type")).toBe("audio/wav");
    expect((await fetch(`${base}/data/music/missing.wav`)).status).toBe(404);
    expect((await fetch(`${base}/data/../index.json`)).status).not.toBe(200);
    expect((await fetch(`${base}/`, { method: "POST" })).status).toBe(405);
  });

  it("explains how to extract when no audio exists", async () => {
    expect(await (await fetch(`http://127.0.0.1:${viewer.port}/`)).text()).toContain("Rode a extração");
  });
});
