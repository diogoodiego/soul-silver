// DS geometry command lists (the display lists inside NSBMD shapes): commands are packed
// four per word, each followed by its parameters. Only what static map models need is
// decoded; anything else is an error so a gap never passes silently.

export class GxFormatError extends Error {
  override name = "GxFormatError";
}

/** Affine 3x4 matrix, row major: [m00 m01 m02 tx, m10 m11 m12 ty, m20 m21 m22 tz]. */
export type Matrix = readonly number[];
export const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export interface GxVertex {
  position: [number, number, number];
  /** Texture coordinates in texels. */
  uv: [number, number];
  color: [number, number, number];
}

export type GxTriangle = [GxVertex, GxVertex, GxVertex];

const PARAMS: Record<number, number> = {
  0x00: 0, 0x10: 1, 0x11: 0, 0x12: 1, 0x13: 1, 0x14: 1, 0x15: 0, 0x16: 16, 0x17: 12, 0x18: 16, 0x19: 12, 0x1a: 9,
  0x1b: 3, 0x1c: 3, 0x20: 1, 0x21: 1, 0x22: 1, 0x23: 2, 0x24: 1, 0x25: 1, 0x26: 1, 0x27: 1, 0x28: 1, 0x29: 1,
  0x2a: 1, 0x2b: 1, 0x30: 1, 0x31: 1, 0x32: 1, 0x33: 1, 0x34: 32, 0x40: 1, 0x41: 0,
};

/** Commands that only affect lighting or polygon attributes, which the flat render ignores. */
const IGNORED = new Set([0x00, 0x21, 0x29, 0x2a, 0x2b, 0x30, 0x31, 0x32, 0x33, 0x34]);

const s16 = (v: number) => ((v & 0xffff) << 16) >> 16;
const s10 = (v: number) => ((v & 0x3ff) << 22) >> 22;
const channel = (c: number) => (c << 3) | (c >> 2);

function apply(m: Matrix, [x, y, z]: [number, number, number]): [number, number, number] {
  return [
    m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
    m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
    m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
  ];
}

/** a * b, both affine 3x4. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      out.push(a[r * 4]! * b[c]! + a[r * 4 + 1]! * b[4 + c]! + a[r * 4 + 2]! * b[8 + c]! + (c === 3 ? a[r * 4 + 3]! : 0));
    }
  }
  return out;
}

function assemble(mode: number, v: GxVertex[], out: GxTriangle[]): void {
  if (mode === 0) for (let i = 0; i + 2 < v.length; i += 3) out.push([v[i]!, v[i + 1]!, v[i + 2]!]);
  else if (mode === 1) {
    for (let i = 0; i + 3 < v.length; i += 4) out.push([v[i]!, v[i + 1]!, v[i + 2]!], [v[i]!, v[i + 2]!, v[i + 3]!]);
  } else if (mode === 2) {
    for (let i = 0; i + 2 < v.length; i++) out.push(i % 2 === 0 ? [v[i]!, v[i + 1]!, v[i + 2]!] : [v[i + 1]!, v[i]!, v[i + 2]!]);
  } else {
    for (let i = 0; i + 3 < v.length; i += 2) out.push([v[i]!, v[i + 1]!, v[i + 3]!], [v[i]!, v[i + 3]!, v[i + 2]!]);
  }
}

/**
 * Decodes a display list into triangles in model space. `restore` returns the matrix a
 * model stored at a stack index (set up by its bytecode), or undefined if there is none;
 * `initial` is the current matrix when the list starts.
 */
export function decodeDisplayList(
  bytes: Uint8Array,
  restore: (index: number) => Matrix | undefined,
  initial: Matrix = IDENTITY,
): GxTriangle[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: GxTriangle[] = [];
  let matrix = initial;
  let mode = -1;
  let vertices: GxVertex[] = [];
  let last: [number, number, number] = [0, 0, 0];
  let uv: [number, number] = [0, 0];
  let color: [number, number, number] = [255, 255, 255];

  const emit = (position: [number, number, number]) => {
    last = position;
    vertices.push({ position: apply(matrix, position), uv, color });
  };
  const flush = () => {
    if (mode >= 0) assemble(mode, vertices, out);
    vertices = [];
    mode = -1;
  };

  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const commands = [0, 1, 2, 3].map((k) => bytes[offset + k]!);
    offset += 4;
    for (const command of commands) {
      const count = PARAMS[command];
      if (count === undefined) throw new GxFormatError(`Unknown geometry command 0x${command.toString(16)}`);
      if (offset + count * 4 > bytes.length) throw new GxFormatError(`Command 0x${command.toString(16)} runs past the list`);
      const p = (i: number) => view.getUint32(offset + i * 4, true);
      switch (command) {
        case 0x14: {
          const stored = restore(p(0) & 0x1f);
          if (!stored) throw new GxFormatError(`Restore of matrix ${p(0) & 0x1f}, which the model never stored`);
          matrix = stored;
          break;
        }
        case 0x1b: {
          const [sx, sy, sz] = [0, 1, 2].map((i) => (p(i) | 0) / 4096) as [number, number, number];
          matrix = multiply(matrix, [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0]);
          break;
        }
        case 0x20:
          color = [channel(p(0) & 0x1f), channel((p(0) >> 5) & 0x1f), channel((p(0) >> 10) & 0x1f)];
          break;
        case 0x22:
          uv = [s16(p(0)) / 16, s16(p(0) >>> 16) / 16];
          break;
        case 0x23:
          emit([s16(p(0)) / 4096, s16(p(0) >>> 16) / 4096, s16(p(1)) / 4096]);
          break;
        case 0x24:
          emit([s10(p(0)) / 64, s10(p(0) >> 10) / 64, s10(p(0) >> 20) / 64]);
          break;
        case 0x25:
          emit([s16(p(0)) / 4096, s16(p(0) >>> 16) / 4096, last[2]]);
          break;
        case 0x26:
          emit([s16(p(0)) / 4096, last[1], s16(p(0) >>> 16) / 4096]);
          break;
        case 0x27:
          emit([last[0], s16(p(0)) / 4096, s16(p(0) >>> 16) / 4096]);
          break;
        case 0x28:
          emit([last[0] + s10(p(0)) / 4096, last[1] + s10(p(0) >> 10) / 4096, last[2] + s10(p(0) >> 20) / 4096]);
          break;
        case 0x40:
          flush();
          mode = p(0) & 3;
          break;
        case 0x41:
          flush();
          break;
        default:
          if (!IGNORED.has(command)) throw new GxFormatError(`Unsupported geometry command 0x${command.toString(16)}`);
      }
      offset += count * 4;
    }
  }
  flush();
  return out;
}
