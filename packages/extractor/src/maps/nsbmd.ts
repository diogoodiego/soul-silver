import { readU16, readU32 } from "../binary.ts";
import { decodeDisplayList, IDENTITY, multiply, type GxTriangle, type Matrix } from "./gx.ts";
import { readDictionary, readNitroBlocks } from "./nitro.ts";

// NSBMD models: node transforms, the render bytecode, materials and shapes, flattened into
// meshes in model space. Layout confirmed on every model of the ROM (research.md R0).

export class ModelFormatError extends Error {
  override name = "ModelFormatError";
}

export interface TextureMatrix {
  scale: [number, number];
  /** [sin, cos]. */
  rotation: [number, number];
  translation: [number, number];
}

export interface ModelMaterial {
  name: string;
  /** Texture and palette names; null when the model links none (animated materials). */
  texture: string | null;
  palette: string | null;
  repeat: [boolean, boolean];
  flip: [boolean, boolean];
  /** Polygon alpha, 0-31. */
  alpha: number;
  texMatrix: TextureMatrix;
}

export interface ModelMesh {
  material: number;
  triangles: GxTriangle[];
}

export interface Model {
  name: string;
  materials: ModelMaterial[];
  meshes: ModelMesh[];
}

const s16 = (b: Uint8Array, o: number) => (readU16(b, o) << 16) >> 16;
const fx32 = (b: Uint8Array, o: number) => (readU32(b, o) | 0) / 4096;
const fx16 = (b: Uint8Array, o: number) => s16(b, o) / 4096;

function scaleMatrix(x: number, y: number, z: number): Matrix {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
}

/** Pivot-compressed rotation: ±1 at the pivot cell, [a b; c d] in the remaining rows and columns. */
function pivotRotation(select: number, neg: number, a: number, b: number): number[] {
  const one = neg & 1 ? -1 : 1;
  const c = neg & 2 ? -b : b;
  const d = neg & 4 ? -a : a;
  const row = Math.floor(select / 3);
  const col = select % 3;
  const rows = [0, 1, 2].filter((r) => r !== row);
  const cols = [0, 1, 2].filter((k) => k !== col);
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  m[row * 3 + col] = one;
  [[a, b], [c, d]].forEach((values, i) => values.forEach((v, j) => (m[rows[i]! * 3 + cols[j]!] = v)));
  return m;
}

/** Node transform T * R * S; flags: 1 no translation, 2 no rotation, 4 no scale, 8 pivot rotation. */
function nodeMatrix(b: Uint8Array, o: number): Matrix {
  const flags = readU16(b, o);
  let p = o + 4;
  let t = [0, 0, 0];
  if (!(flags & 1)) {
    t = [fx32(b, p), fx32(b, p + 4), fx32(b, p + 8)];
    p += 12;
  }
  let r = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (flags & 8) {
    r = pivotRotation((flags >> 4) & 0xf, (flags >> 8) & 0xf, fx16(b, p), fx16(b, p + 2));
    p += 4;
  } else if (!(flags & 2)) {
    r = [fx16(b, o + 2), ...Array.from({ length: 8 }, (_, i) => fx16(b, p + i * 2))];
    p += 16;
  }
  let s = [1, 1, 1];
  if (!(flags & 4)) s = [fx32(b, p), fx32(b, p + 4), fx32(b, p + 8)];
  return [0, 1, 2].flatMap((row) => [r[row * 3]! * s[0]!, r[row * 3 + 1]! * s[1]!, r[row * 3 + 2]! * s[2]!, t[row]!]);
}

function readMaterials(b: Uint8Array, section: number): ModelMaterial[] {
  const linked = (dictOffset: number) => {
    const byMaterial = new Map<number, string>();
    for (const entry of readDictionary(b, section + dictOffset)) {
      const list = section + readU16(entry.data, 0);
      for (let i = 0; i < entry.data[2]!; i++) byMaterial.set(b[list + i]!, entry.name);
    }
    return byMaterial;
  };
  const textures = linked(readU16(b, section));
  const palettes = linked(readU16(b, section + 2));

  return readDictionary(b, section + 4).map((entry, id) => {
    const d = section + readU32(entry.data, 0);
    const params = readU32(b, d + 0x14);
    const flags = readU16(b, d + 0x1e);
    let p = d + 0x2c;
    const texMatrix: TextureMatrix = { scale: [1, 1], rotation: [0, 1], translation: [0, 0] };
    if (!(flags & 2)) {
      texMatrix.scale = [fx32(b, p), fx32(b, p + 4)];
      p += 8;
    }
    if (!(flags & 4)) {
      texMatrix.rotation = [fx16(b, p), fx16(b, p + 2)];
      p += 4;
    }
    if (!(flags & 8)) texMatrix.translation = [fx32(b, p), fx32(b, p + 4)];
    return {
      name: entry.name,
      texture: textures.get(id) ?? null,
      palette: palettes.get(id) ?? null,
      repeat: [Boolean(params & (1 << 16)), Boolean(params & (1 << 17))],
      flip: [Boolean(params & (1 << 18)), Boolean(params & (1 << 19))],
      alpha: (readU32(b, d + 0x0c) >> 16) & 0x1f,
      texMatrix,
    };
  });
}

function readModel(b: Uint8Array, m: number, name: string): Model {
  const sbcStart = m + readU32(b, m + 4);
  const sbcEnd = m + readU32(b, m + 8);
  const shapeSection = m + readU32(b, m + 12);
  const posScale = fx32(b, m + 0x1c);
  const invPosScale = fx32(b, m + 0x20);

  const nodeDict = m + 0x40;
  const nodes = readDictionary(b, nodeDict).map((entry) => nodeMatrix(b, nodeDict + readU32(entry.data, 0)));
  const shapes = readDictionary(b, shapeSection).map((entry) => {
    const s = shapeSection + readU32(entry.data, 0);
    const start = s + readU32(b, s + 8);
    return b.subarray(start, start + readU32(b, s + 12));
  });
  const materials = readMaterials(b, m + readU32(b, m + 8));

  const stack = new Map<number, Matrix>();
  const stored = (index: number) => {
    const matrix = stack.get(index);
    if (!matrix) throw new ModelFormatError(`${name}: matrix ${index} restored before it was stored`);
    return matrix;
  };
  const meshes: ModelMesh[] = [];
  let current = IDENTITY;
  let material = -1;

  for (let o = sbcStart; o < sbcEnd; ) {
    const op = b[o]!;
    const variant = op >> 5;
    switch (op & 0x1f) {
      case 0x00:
        o += 1;
        break;
      case 0x01:
        return { name, materials, meshes };
      case 0x02:
        o += 3;
        break;
      case 0x03:
        current = stored(b[o + 1]!);
        o += 2;
        break;
      case 0x04:
        material = b[o + 1]!;
        if (material >= materials.length) throw new ModelFormatError(`${name}: material ${material} does not exist`);
        o += 2;
        break;
      case 0x05: {
        const shape = shapes[b[o + 1]!];
        if (!shape) throw new ModelFormatError(`${name}: shape ${b[o + 1]} does not exist`);
        if (material < 0) throw new ModelFormatError(`${name}: shape drawn before any material`);
        meshes.push({ material, triangles: decodeDisplayList(shape, (index) => stack.get(index), current) });
        o += 2;
        break;
      }
      case 0x06: {
        const node = nodes[b[o + 1]!];
        if (!node) throw new ModelFormatError(`${name}: node ${b[o + 1]} does not exist`);
        const dest = variant & 1 ? b[o + 4] : undefined;
        const src = variant & 2 ? b[o + 4 + (variant & 1)] : undefined;
        if (src !== undefined) current = stored(src);
        current = multiply(current, node);
        if (dest !== undefined) stack.set(dest, current);
        o += 4 + (variant & 1) + ((variant >> 1) & 1);
        break;
      }
      case 0x07:
      case 0x08: {
        // Billboards face the camera at runtime; the fixed projection keeps the node matrix.
        const dest = variant & 1 ? b[o + 2] : undefined;
        const src = variant & 2 ? b[o + 2 + (variant & 1)] : undefined;
        if (src !== undefined) current = stored(src);
        if (dest !== undefined) stack.set(dest, current);
        o += 2 + (variant & 1) + ((variant >> 1) & 1);
        break;
      }
      case 0x09: {
        // Skinning blend: static maps keep the matrix with the largest weight.
        const count = b[o + 2]!;
        let best = -1;
        let weight = -1;
        for (let i = 0; i < count; i++) {
          if (b[o + 5 + i * 3]! > weight) [best, weight] = [b[o + 3 + i * 3]!, b[o + 5 + i * 3]!];
        }
        if (best >= 0) stack.set(b[o + 1]!, stored(best));
        o += 3 + count * 3;
        break;
      }
      case 0x0b:
        current = multiply(current, variant & 1 ? scaleMatrix(invPosScale, invPosScale, invPosScale) : scaleMatrix(posScale, posScale, posScale));
        o += 1;
        break;
      case 0x0c:
      case 0x0d:
        o += 3;
        break;
      default:
        throw new ModelFormatError(`${name}: unknown bytecode instruction 0x${op.toString(16)}`);
    }
  }
  throw new ModelFormatError(`${name}: bytecode has no RET`);
}

/** Reads every model of an NSBMD file. */
export function readModels(bytes: Uint8Array): Model[] {
  const mdl = readNitroBlocks(bytes, "BMD0").get("MDL0");
  if (mdl === undefined) throw new ModelFormatError("BMD0 without an MDL0 block");
  return readDictionary(bytes, mdl + 8).map((entry) => readModel(bytes, mdl + readU32(entry.data, 0), entry.name));
}
