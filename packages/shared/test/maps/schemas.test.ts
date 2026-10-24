import { describe, expect, it } from "vitest";
import { parseMapJson, serializeMapFile } from "../../src/maps/schemas.ts";

const header = (extra: Record<string, unknown> = {}) => ({
  id: 0,
  mapsec: 1,
  areaType: "outdoor",
  area: 3,
  matrix: 0,
  musicDay: 1000,
  musicNight: 1000,
  weather: 0,
  refs: { events: 1, scripts: 2, messages: 3, encounters: null },
  ...extra,
});

const headers = (records: unknown[] = [header()]) => ({ kind: "map-headers", formatVersion: 1, records });

const area = (extra: Record<string, unknown> = {}) => ({
  id: 0,
  name: "map",
  width: 2,
  height: 1,
  pieces: [5, null],
  heights: [0, 1],
  maps: [7, 7],
  ...extra,
});

const areas = (records: unknown[] = [area()]) => ({ kind: "map-areas", formatVersion: 1, records });

const collision = (extra: Record<string, unknown> = {}) => ({
  kind: "map-collision",
  formatVersion: 1,
  map: 7,
  level: 0,
  width: 2,
  height: 1,
  tiles: [{ category: "free", raw: 0 }, { category: "ledge", raw: 0x3b, direction: "south" }],
  ...extra,
});

const report = (records: unknown[]) => ({ kind: "map-report", formatVersion: 1, records });

describe("map-headers schema", () => {
  it("accepts a header with an empty encounter reference", () => {
    expect(parseMapJson("map-headers", JSON.stringify(headers()), "map-headers.json").ok).toBe(true);
  });

  it("refuses a missing field, naming its path", () => {
    const missing: Record<string, unknown> = header();
    delete missing.musicDay;
    const result = parseMapJson("map-headers", JSON.stringify(headers([missing])), "map-headers.json");
    expect(result).toMatchObject({ ok: false, error: { file: "map-headers.json", path: "records.0.musicDay" } });
  });

  it("refuses an area type outside the enum", () => {
    const result = parseMapJson("map-headers", JSON.stringify(headers([header({ areaType: "space" })])), "h.json");
    expect(result).toMatchObject({ ok: false, error: { path: "records.0.areaType" } });
  });
});

describe("map-areas schema", () => {
  it("accepts a matrix with empty cells", () => {
    expect(parseMapJson("map-areas", JSON.stringify(areas()), "a.json").ok).toBe(true);
  });

  it("accepts a matrix without heights or maps", () => {
    expect(parseMapJson("map-areas", JSON.stringify(areas([area({ heights: null, maps: null })])), "a.json").ok).toBe(true);
  });

  it.each(["pieces", "heights", "maps"])("refuses a %s grid whose size is not width x height", (grid) => {
    const result = parseMapJson("map-areas", JSON.stringify(areas([area({ [grid]: [1] })])), "a.json");
    expect(result).toMatchObject({ ok: false, error: { path: `records.0.${grid}` } });
  });
});

describe("map-collision schema", () => {
  it("accepts one cell per tile", () => {
    expect(parseMapJson("map-collision", JSON.stringify(collision()), "0.json").ok).toBe(true);
  });

  it("refuses a tile count different from width x height", () => {
    const result = parseMapJson("map-collision", JSON.stringify(collision({ width: 3 })), "0.json");
    expect(result).toMatchObject({ ok: false, error: { path: "tiles" } });
  });

  it("refuses a ledge without direction and a direction outside a ledge", () => {
    const noDirection = collision({ tiles: [{ category: "free", raw: 0 }, { category: "ledge", raw: 0x3b }] });
    expect(parseMapJson("map-collision", JSON.stringify(noDirection), "0.json")).toMatchObject({
      ok: false,
      error: { path: "tiles.1" },
    });
    const stray = collision({ tiles: [{ category: "free", raw: 0, direction: "north" }, { category: "free", raw: 0 }] });
    expect(parseMapJson("map-collision", JSON.stringify(stray), "0.json")).toMatchObject({ ok: false, error: { path: "tiles.0" } });
  });

  it("requires targetLevel exactly on level transitions", () => {
    const tiles = [{ category: "levelTransition", raw: 0x71 }, { category: "free", raw: 0 }];
    expect(parseMapJson("map-collision", JSON.stringify(collision({ tiles })), "0.json")).toMatchObject({ ok: false });
    tiles[0] = { category: "levelTransition", raw: 0x71, targetLevel: 1 } as (typeof tiles)[0];
    expect(parseMapJson("map-collision", JSON.stringify(collision({ tiles })), "0.json").ok).toBe(true);
  });
});

describe("map-report schema", () => {
  it("accepts each status in its valid form", () => {
    const records = [
      { id: 0, status: "success", warnings: [] },
      { id: 1, status: "successWithWarnings", warnings: [{ code: "animated-texture", detail: "water" }] },
      { id: 2, status: "failure", stage: "render", reason: "modelo sem textura", warnings: [] },
    ];
    expect(parseMapJson("map-report", JSON.stringify(report(records)), "report.json").ok).toBe(true);
  });

  it("accepts the scene warnings for textures and models the ROM lacks", () => {
    const warnings = [{ code: "missing-texture", detail: "nowhere" }, { code: "missing-model", detail: "999" }];
    expect(parseMapJson("map-report", JSON.stringify(report([{ id: 0, status: "successWithWarnings", warnings }])), "r.json").ok).toBe(true);
  });

  it("refuses a failure without a reason", () => {
    const result = parseMapJson("map-report", JSON.stringify(report([{ id: 0, status: "failure", stage: "render", warnings: [] }])), "r.json");
    expect(result).toMatchObject({ ok: false, error: { path: "records.0" } });
  });

  it("refuses success with warnings but no warning", () => {
    const result = parseMapJson("map-report", JSON.stringify(report([{ id: 0, status: "successWithWarnings", warnings: [] }])), "r.json");
    expect(result).toMatchObject({ ok: false, error: { path: "records.0" } });
  });
});

describe("serializeMapFile", () => {
  it("writes deterministic JSON that parses back", () => {
    const text = serializeMapFile("map-collision", collision() as never);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseMapJson("map-collision", text, "0.json").ok).toBe(true);
  });
});

describe("map-animations schema", () => {
  const scroll = {
    type: "scroll",
    material: "en_sp1_3",
    duration: 2,
    scaleS: { constant: 1 },
    scaleT: { constant: 1 },
    rotation: { constant: [0, 1] },
    translateS: { constant: 0 },
    translateT: { values: [0, -0.5] },
  };
  const pattern = { type: "pattern", material: "pc_moni", duration: 8, textures: ["a"], palettes: ["a_pl"], keys: [{ frame: 0, texture: 0, palette: 0 }, { frame: 4, texture: 0, palette: 0 }] };
  const region = { level: 0, layer: "lower", x: 16, y: 0, width: 32, height: 16 };
  const file = (animations: unknown[], regions: unknown[] = []) => ({ kind: "map-animations", formatVersion: 1, map: 60, frames: 8, regions, animations });

  it("accepts scroll and pattern animations", () => {
    expect(parseMapJson("map-animations", JSON.stringify(file([scroll, pattern])), "animations.json").ok).toBe(true);
  });

  it("accepts the regions of the played frames and refuses a layer or size that makes no sense", () => {
    expect(parseMapJson("map-animations", JSON.stringify(file([scroll], [region])), "a.json").ok).toBe(true);
    expect(parseMapJson("map-animations", JSON.stringify(file([scroll], [{ ...region, layer: "middle" }])), "a.json")).toMatchObject({ ok: false, error: { path: "regions.0.layer" } });
    expect(parseMapJson("map-animations", JSON.stringify(file([scroll], [{ ...region, width: 0 }])), "a.json")).toMatchObject({ ok: false, error: { path: "regions.0.width" } });
  });

  it("refuses a key that points at a texture or palette the animation does not list", () => {
    const bad = { ...pattern, keys: [{ frame: 0, texture: 1, palette: 0 }] };
    expect(parseMapJson("map-animations", JSON.stringify(file([bad])), "a.json")).toMatchObject({ ok: false, error: { path: "animations.0.keys.0.texture" } });
  });

  it("refuses keys whose frames do not increase", () => {
    const bad = { ...pattern, keys: [{ frame: 4, texture: 0, palette: 0 }, { frame: 4, texture: 0, palette: 0 }] };
    expect(parseMapJson("map-animations", JSON.stringify(file([bad])), "a.json")).toMatchObject({ ok: false, error: { path: "animations.0.keys.1.frame" } });
  });
});
