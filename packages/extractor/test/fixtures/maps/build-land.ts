import { ByteWriter } from "../byte-writer.ts";

// Synthetic land data (map pieces) in the layout confirmed on the ROM
// (specs/006-map-prerender/research.md R0): 4 x u32 section sizes, the HGSS extra block,
// permissions (32 x 32 u16), 48-byte buildings, NSBMD model, BDHC heights.

export interface BuildingSpec {
  model: number;
  /** World units (16 per tile). */
  position: [number, number, number];
  scale?: [number, number, number];
}

export interface PlateSpec {
  /** Opposite corners (x, z) in world units. */
  from: [number, number];
  to: [number, number];
  /** Plane: y = -(nx * x + nz * z + d) / ny. */
  normal: [number, number, number];
  d: number;
}

export interface LandSpec {
  /** 1024 values, row by row (z, then x); missing entries are 0. */
  permissions?: number[];
  buildings?: BuildingSpec[];
  model?: Uint8Array;
  plates?: PlateSpec[];
}

const fx32 = (v: number) => Math.round(v * 4096) | 0;

/** Flat ground at height 0 over the whole piece. */
export const FLAT_GROUND: PlateSpec = { from: [-256, -256], to: [256, 256], normal: [0, 1, 0], d: 0 };

export function buildBdhc(plates: PlateSpec[]): Uint8Array {
  const w = new ByteWriter().ascii("BDHC");
  w.u16(plates.length * 2).u16(plates.length).u16(plates.length).u16(plates.length).u16(1).u16(plates.length);
  for (const p of plates) w.u32(fx32(p.from[0])).u32(fx32(p.from[1])).u32(fx32(p.to[0])).u32(fx32(p.to[1]));
  for (const p of plates) for (const n of p.normal) w.u32(fx32(n));
  for (const p of plates) w.u32(fx32(p.d));
  plates.forEach((_, i) => w.u16(i * 2).u16(i * 2 + 1).u16(i).u16(i));
  w.u32(fx32(256)).u16(plates.length).u16(0);
  plates.forEach((_, i) => w.u16(i));
  return w.align(4).toBytes();
}

export function buildLand(spec: LandSpec = {}): Uint8Array {
  const permissions = new ByteWriter();
  for (let i = 0; i < 1024; i++) permissions.u16(spec.permissions?.[i] ?? 0);
  const buildings = new ByteWriter();
  for (const b of spec.buildings ?? []) {
    buildings.u32(b.model);
    for (const v of b.position) buildings.u32(fx32(v));
    buildings.u32(0).u32(0).u32(0);
    for (const v of b.scale ?? [1, 1, 1]) buildings.u32(fx32(v));
    buildings.u32(0).u32(0);
  }
  const model = spec.model ?? new Uint8Array(0);
  const bdhc = buildBdhc(spec.plates ?? [FLAT_GROUND]);
  const extra = new Uint8Array(4);
  return new ByteWriter()
    .u32(permissions.length).u32(buildings.length).u32(model.length).u32(bdhc.length)
    .u16(0x1234).u16(extra.length).raw(extra)
    .raw(permissions.toBytes()).raw(buildings.toBytes()).raw(model).raw(bdhc)
    .toBytes();
}
