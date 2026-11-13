import { existsSync } from "node:fs";
import { join } from "node:path";
import type { WorldMap } from "@soulsilver/shared/game";
import { describe, expect, it } from "vitest";
import { loadWorld } from "../src/server-host/world-loader";

// SC-005 against the local extraction (never committed, principle II): every warp of New Bark Town,
// Route 29, Cherrygrove City and the buildings reached from them leads somewhere that leads back.
// Skipped when there is no extraction. Override the folder with SOULSILVER_STAGES.

const stages = process.env["SOULSILVER_STAGES"] ?? join(process.env["APPDATA"] ?? "", "SoulSilver Desktop", "extraction", "stages");
const ROUTE = ["60", "33", "67"];
/** Route maps, their buildings and the floors inside those (e.g. the player's room upstairs). */
const DEPTH = 2;
/** HGSS "go back where you came from" destination; needs remembered state, out of scope here. */
const DYNAMIC_WARP = "4095";
const center = (t: number) => t * 16 + 8;

describe.skipIf(!existsSync(join(stages, "maps", "maps", "map-headers.json")))("route warps (SC-005)", () => {
  const logs: string[] = [];
  const world = loadWorld(stages, (m) => logs.push(m));

  // The route maps plus the maps reachable from them in DEPTH warps.
  const reached = new Map<string, WorldMap>();
  const queue = ROUTE.map((id) => ({ id, depth: 0 }));
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const map = world(id);
    if (!map || reached.has(id)) continue;
    reached.set(id, map);
    if (depth < DEPTH) queue.push(...map.warps.map((w) => ({ id: w.destMap, depth: depth + 1 })));
  }

  it("loads the three route maps, connected as in the original", () => {
    expect(ROUTE.every((id) => reached.has(id))).toBe(true);
    expect(world("60")!.neighbors.map((n) => n.map)).toContain("33");
    expect(world("33")!.neighbors.map((n) => n.map)).toContain("67");
  });

  it("enters the buildings of the route", () => {
    expect(ROUTE.reduce((n, id) => n + world(id)!.warps.length, 0)).toBeGreaterThanOrEqual(10);
  });

  it("has every warp land on a tile inside its destination, which warps back to the origin", () => {
    const problems: string[] = [];
    for (const [id, map] of reached) {
      map.warps.forEach((w, i) => {
        const dest = world(w.destMap);
        const anchor = dest?.warps[w.destAnchor];
        if (!dest || !anchor) return problems.push(`${id}#${i}: no destination ${w.destMap}#${w.destAnchor}`);
        if (center(anchor.tx) >= dest.widthPx || center(anchor.ty) >= dest.heightPx) problems.push(`${id}#${i}: lands outside ${w.destMap}`);
        if (anchor.destMap !== id && anchor.destMap !== DYNAMIC_WARP) problems.push(`${id}#${i}: ${w.destMap}#${w.destAnchor} leads to ${anchor.destMap}, not back`);
      });
    }
    expect(problems).toEqual([]);
  });

  it("logs no broken warp on these maps", () => {
    expect(logs.filter((l) => ROUTE.some((id) => l.startsWith(`Map ${id}:`)))).toEqual([]);
  });
});
