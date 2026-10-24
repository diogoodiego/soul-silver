import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startViewer, type Viewer } from "../../src/viewer/serve.ts";

let root: string;
let viewer: Viewer;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ss-sprites-viewer-"));
  await mkdir(join(root, "sprites"), { recursive: true });
  await writeFile(join(root, "sprites", "battle.json"), "{}\n");
  await writeFile(join(root, "sprites", "battle-0.png"), new Uint8Array([0x89, 0x50]));
  viewer = await startViewer({ mapsDir: join(root, "sprites"), port: 0, html: await readFile(new URL("../../src/viewer/sprites.html", import.meta.url), "utf8") });
});

afterEach(async () => {
  await viewer.close();
  await rm(root, { recursive: true, force: true });
});

describe("sprites preview", () => {
  it("serves the page and the stage files, read-only", async () => {
    const base = `http://127.0.0.1:${viewer.port}`;
    expect(await (await fetch(`${base}/`)).text()).toContain("<title>Sprites</title>");
    expect((await fetch(`${base}/data/battle.json`)).status).toBe(200);
    expect((await fetch(`${base}/data/battle-0.png`)).headers.get("content-type")).toBe("image/png");
    expect((await fetch(`${base}/data/missing.json`)).status).toBe(404);
    expect((await fetch(`${base}/`, { method: "POST" })).status).toBe(405);
  });

  it("explains how to extract when no sprites exist", async () => {
    expect(await (await fetch(`http://127.0.0.1:${viewer.port}/`)).text()).toContain("Rode a extração");
  });
});
