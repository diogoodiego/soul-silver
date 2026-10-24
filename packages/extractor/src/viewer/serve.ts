// Development map viewer (research.md R9): a read-only HTTP server on the loopback address
// that serves the viewer page and, under /data/, the files of the maps stage output.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";

export const VIEWER_HOST = "127.0.0.1";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
};

export interface ViewerOptions {
  /** The maps stage output folder (stages/maps/maps). */
  mapsDir: string;
  /** 0 picks a free port. */
  port?: number;
  /** Viewer page; defaults to index.html next to this file. */
  html?: string;
  /** Map names by mapsec (text bank "map-names"), served at /names.json. */
  names?: Record<number, string>;
}

export interface Viewer {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

/** Resolves a /data/ request path inside the maps folder, or undefined if it would leave it. */
function dataPath(root: string, encoded: string): string | undefined {
  let path: string;
  try {
    path = decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
  if (path.includes("\\") || path.includes(":") || path.startsWith("/") || path.split("/").some((part) => part === ".." || part === ".")) {
    return undefined;
  }
  const full = resolve(root, path);
  return full.startsWith(root + sep) ? full : undefined;
}

export async function startViewer(options: ViewerOptions): Promise<Viewer> {
  const root = resolve(options.mapsDir);
  const html = options.html ?? (await readFile(new URL("./index.html", import.meta.url), "utf8"));

  const server = createServer((req, res) => {
    const send = (status: number, type: string, body: string | Uint8Array) => {
      res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      res.end(body);
    };
    if (req.method !== "GET") return send(405, "text/plain; charset=utf-8", "Somente GET");
    const url = (req.url ?? "/").split("?")[0]!;
    if (url === "/") return send(200, "text/html; charset=utf-8", html);
    if (url === "/names.json") return send(200, TYPES[".json"]!, JSON.stringify(options.names ?? {}));
    if (!url.startsWith("/data/")) return send(404, "text/plain; charset=utf-8", "Não encontrado");
    const file = dataPath(root, url.slice("/data/".length));
    const type = file && TYPES[extname(file)];
    if (!file || !type) return send(403, "text/plain; charset=utf-8", "Caminho recusado");
    readFile(file).then(
      (body) => send(200, type, body),
      () => send(404, "text/plain; charset=utf-8", "Não encontrado"),
    );
  });

  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(options.port ?? 0, VIEWER_HOST, done);
  });
  const { port } = server.address() as AddressInfo;
  return {
    host: VIEWER_HOST,
    port,
    url: `http://${VIEWER_HOST}:${port}/`,
    close: () => new Promise((done) => server.close(() => done())),
  };
}
