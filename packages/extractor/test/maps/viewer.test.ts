import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startViewer, type Viewer } from "../../src/viewer/serve.ts";

let root: string;
let viewer: Viewer;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ss-viewer-"));
  await mkdir(join(root, "maps", "0060", "layers"), { recursive: true });
  await writeFile(join(root, "maps", "map-headers.json"), "{}\n");
  await writeFile(join(root, "maps", "0060", "layers", "0-lower.png"), new Uint8Array([0x89, 0x50]));
  await writeFile(join(root, "secret.txt"), "outside");
  viewer = await startViewer({ mapsDir: join(root, "maps"), port: 0, html: "<!doctype html><title>Mapas</title>", names: { 126: "New Bark Town" } });
});

afterEach(async () => {
  await viewer.close();
  await rm(root, { recursive: true, force: true });
});

/** Raw request, so paths reach the server exactly as written (no URL normalization). */
function get(path: string, method = "GET"): Promise<{ status: number; type: string | undefined; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: viewer.port, path, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"], body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("startViewer", () => {
  it("listens on the loopback address only", () => {
    expect(viewer.host).toBe("127.0.0.1");
    expect(viewer.url).toBe(`http://127.0.0.1:${viewer.port}/`);
  });

  it("serves the viewer page at /", async () => {
    const res = await get("/");
    expect([res.status, res.type]).toEqual([200, "text/html; charset=utf-8"]);
    expect(res.body.toString()).toContain("<title>Mapas</title>");
  });

  it("serves files from the maps folder under /data/, with their type", async () => {
    const png = await get("/data/0060/layers/0-lower.png");
    expect([png.status, png.type, [...png.body]]).toEqual([200, "image/png", [0x89, 0x50]]);
    const json = await get("/data/map-headers.json");
    expect([json.status, json.type]).toEqual([200, "application/json; charset=utf-8"]);
  });

  it.each(["/data/../secret.txt", "/data/%2e%2e/secret.txt", "/data/..%5csecret.txt", "/data/C:/Windows/win.ini", "/secret.txt"])(
    "refuses %s",
    async (path) => {
      const res = await get(path);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.toString()).not.toContain("outside");
    },
  );

  it("serves the map names by mapsec at /names.json", async () => {
    const res = await get("/names.json");
    expect([res.status, JSON.parse(res.body.toString())]).toEqual([200, { 126: "New Bark Town" }]);
  });

  it("answers 404 for a missing file", async () => {
    expect((await get("/data/9999/collision/0.json")).status).toBe(404);
  });

  it("accepts only GET", async () => {
    expect((await get("/data/map-headers.json", "POST")).status).toBe(405);
  });
});
