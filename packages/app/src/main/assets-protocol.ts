import { isAbsolute, relative, resolve, sep } from "node:path";

// Read-only access from the renderer to the user's extraction (spec 011, principle IX).
// URLs look like assets://stages/maps/maps/0060/mesh.json, relative to the extraction folder.

export const ASSETS_SCHEME = "assets";

/** The file a URL names inside `root`, or undefined for anything that would leave it. */
export function resolveAssetPath(root: string, url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== `${ASSETS_SCHEME}:`) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(`${parsed.host}${parsed.pathname}`);
  } catch {
    return undefined;
  }
  if (path.includes("\0") || path.includes(":")) return undefined;
  const segments = path.split(/[\\/]/).filter((s) => s.length > 0);
  if (segments.some((s) => s === "." || s === "..")) return undefined;
  const target = resolve(root, ...segments);
  const rel = relative(root, target);
  if (rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return undefined;
  return target;
}
