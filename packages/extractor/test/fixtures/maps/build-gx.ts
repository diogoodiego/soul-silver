import { ByteWriter } from "../byte-writer.ts";

// Synthetic DS geometry command lists: commands packed four per word, each followed by its
// parameters (GX FIFO layout).

export function displayList(commands: [number, ...number[]][]): Uint8Array {
  const w = new ByteWriter();
  for (let i = 0; i < commands.length; i += 4) {
    const group = commands.slice(i, i + 4);
    for (let k = 0; k < 4; k++) w.u8(group[k]?.[0] ?? 0);
    for (const [, ...params] of group) for (const p of params) w.u32(p >>> 0);
  }
  return w.toBytes();
}

export const fx = (v: number) => Math.round(v * 4096) & 0xffff;

export const vtx16 = (x: number, y: number, z: number): [number, number, number] => [0x23, fx(x) | (fx(y) << 16), fx(z)];

export const texcoord = (s: number, t: number): [number, number] => [
  0x22,
  (Math.round(s * 16) & 0xffff) | ((Math.round(t * 16) & 0xffff) << 16),
];

/** One triangle with the given vertices. */
export const triangleList = (...vertices: [number, number, number][]) =>
  displayList([[0x40, 0], ...vertices.map(([x, y, z]) => vtx16(x, y, z)), [0x41]]);
