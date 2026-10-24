import { ByteWriter } from "../byte-writer.ts";

// Synthetic Nitro containers and dictionaries, written from the layout confirmed on the
// ROM (specs/006-map-prerender/research.md R0), independently of the code under test.

export interface DictEntry {
  name: string;
  /** Exactly the dictionary entry size. */
  data: Uint8Array;
}

/** Dictionary: header, patricia tree (ignored by readers), entries, 16-byte names. */
export function buildDictionary(entries: DictEntry[], entrySize: number): Uint8Array {
  const n = entries.length;
  const treeSize = 4 + 8 + 4 * n;
  const infoSize = 4 + n * entrySize;
  const w = new ByteWriter();
  w.u8(0).u8(n).u16(treeSize + infoSize + 16 * n);
  // The second u16 is the distance from the dictionary start to the entries.
  w.u16(8).u16(treeSize).u32(0x17f);
  for (let i = 0; i < n; i++) w.u32(0);
  w.u16(entrySize).u16(infoSize);
  for (const entry of entries) {
    if (entry.data.length !== entrySize) throw new Error(`Entry ${entry.name} is not ${entrySize} bytes`);
    w.raw(entry.data);
  }
  for (const entry of entries) {
    w.ascii(entry.name.slice(0, 16));
    for (let i = entry.name.length; i < 16; i++) w.u8(0);
  }
  return w.toBytes();
}

/** Nitro file: magic, BOM, version, size, header size, block count, block offsets. */
export function buildNitroFile(magic: string, blocks: Uint8Array[]): Uint8Array {
  const headerSize = 16 + 4 * blocks.length;
  const w = new ByteWriter();
  w.ascii(magic).u16(0xfeff).u16(2).u32(0).u16(16).u16(blocks.length);
  let offset = headerSize;
  for (const block of blocks) {
    w.u32(offset);
    offset += block.length;
  }
  for (const block of blocks) w.raw(block);
  w.setU32(8, w.length);
  return w.toBytes();
}

/** Block: 4-byte magic, u32 size (including these 8 bytes), body. */
export function buildBlock(magic: string, body: Uint8Array): Uint8Array {
  return new ByteWriter().ascii(magic).u32(8 + body.length).raw(body).toBytes();
}

export const u32Bytes = (value: number) => new ByteWriter().u32(value).toBytes();

const fx32 = (v: number) => Math.round(v * 4096) | 0;
const fx16 = (v: number) => Math.round(v * 4096) & 0xffff;

export interface NodeSpec {
  name: string;
  translation?: [number, number, number];
  /** Pivot-compressed rotation: select 0-8, neg bits (1 one, 2 c, 4 d), a and b. */
  pivot?: { select: number; neg: number; a: number; b: number };
  scale?: [number, number, number];
}

export interface MaterialSpec {
  name: string;
  texture?: string;
  palette?: string;
  repeat?: [boolean, boolean];
  flip?: [boolean, boolean];
  /** 0-31. */
  alpha?: number;
  texMatrix?: { scale?: [number, number]; rotation?: [number, number]; translation?: [number, number] };
}

export interface ModelSpec {
  name: string;
  posScale?: number;
  nodes: NodeSpec[];
  /** Bytecode, RET included. */
  sbc: number[];
  materials: MaterialSpec[];
  /** One display list per shape. */
  shapes: Uint8Array[];
}

function nodeData(node: NodeSpec): Uint8Array {
  const flags =
    (node.translation ? 0 : 1) | 2 | (node.scale ? 0 : 4) | (node.pivot ? 8 | (node.pivot.select << 4) | (node.pivot.neg << 8) : 0);
  const w = new ByteWriter().u16(node.pivot ? flags & ~2 : flags).u16(fx16(1));
  if (node.translation) for (const v of node.translation) w.u32(fx32(v));
  if (node.pivot) w.u16(fx16(node.pivot.a)).u16(fx16(node.pivot.b));
  if (node.scale) for (const v of [...node.scale, ...node.scale.map((s) => 1 / s)]) w.u32(fx32(v));
  return w.toBytes();
}

function materialData(m: MaterialSpec): Uint8Array {
  const tm = m.texMatrix;
  const flags = 0x1fc0 | (tm ? 1 : 0) | (tm?.scale ? 0 : 2) | (tm?.rotation ? 0 : 4) | (tm?.translation ? 0 : 8);
  const params =
    (m.repeat?.[0] ? 1 << 16 : 0) | (m.repeat?.[1] ? 1 << 17 : 0) | (m.flip?.[0] ? 1 << 18 : 0) | (m.flip?.[1] ? 1 << 19 : 0);
  const w = new ByteWriter().u16(0).u16(0).u32(0).u32(0).u32((m.alpha ?? 31) << 16).u32(0).u32(params).u32(0);
  w.u16(0).u16(flags).u16(8).u16(8).u32(fx32(1)).u32(fx32(1));
  if (tm?.scale) w.u32(fx32(tm.scale[0])).u32(fx32(tm.scale[1]));
  if (tm?.rotation) w.u16(fx16(tm.rotation[0])).u16(fx16(tm.rotation[1]));
  if (tm?.translation) w.u32(fx32(tm.translation[0])).u32(fx32(tm.translation[1]));
  w.setU16(2, w.length);
  return w.toBytes();
}

/** Material section: offsets of the texture and palette link dictionaries, materials, links. */
function materialSection(materials: MaterialSpec[]): Uint8Array {
  const links = (key: "texture" | "palette") => {
    const names = [...new Set(materials.flatMap((m) => (m[key] ? [m[key]] : [])))];
    return names.map((name) => ({ name, ids: materials.flatMap((m, i) => (m[key] === name ? [i] : [])) }));
  };
  const tex = links("texture");
  const pal = links("palette");
  const datas = materials.map(materialData);
  const dictSize = (n: number, entry: number) => buildDictionary(Array.from({ length: n }, (_, i) => ({ name: `${i}`, data: new Uint8Array(entry) })), entry).length;

  const matDictAt = 4;
  const texDictAt = matDictAt + dictSize(materials.length, 4);
  const palDictAt = texDictAt + dictSize(tex.length, 4);
  let cursor = palDictAt + dictSize(pal.length, 4);
  const listAt = (ids: number[]) => {
    const at = cursor;
    cursor += Math.ceil(ids.length / 4) * 4;
    return at;
  };
  const texEntries = tex.map((t) => ({ name: t.name, ids: t.ids, at: listAt(t.ids) }));
  const palEntries = pal.map((p) => ({ name: p.name, ids: p.ids, at: listAt(p.ids) }));
  const dataAt: number[] = [];
  for (const data of datas) {
    dataAt.push(cursor);
    cursor += data.length;
  }

  const link = (e: { at: number; ids: number[] }) => new ByteWriter().u16(e.at).u8(e.ids.length).u8(0).toBytes();
  const w = new ByteWriter().u16(texDictAt).u16(palDictAt);
  w.raw(buildDictionary(materials.map((m, i) => ({ name: m.name, data: u32Bytes(dataAt[i]!) })), 4));
  w.raw(buildDictionary(texEntries.map((e) => ({ name: e.name, data: link(e) })), 4));
  w.raw(buildDictionary(palEntries.map((e) => ({ name: e.name, data: link(e) })), 4));
  for (const e of [...texEntries, ...palEntries]) {
    for (const id of e.ids) w.u8(id);
    w.align(4);
  }
  for (const data of datas) w.raw(data);
  return w.toBytes();
}

function shapeSection(shapes: Uint8Array[]): Uint8Array {
  const dictLength = buildDictionary(shapes.map((_, i) => ({ name: `s${i}`, data: new Uint8Array(4) })), 4).length;
  const at: number[] = [];
  let cursor = dictLength;
  for (const dl of shapes) {
    at.push(cursor);
    cursor += 16 + dl.length;
  }
  const w = new ByteWriter().raw(buildDictionary(shapes.map((_, i) => ({ name: `s${i}`, data: u32Bytes(at[i]!) })), 4));
  for (const dl of shapes) w.u16(0).u16(16).u32(0).u32(16).u32(dl.length).raw(dl);
  return w.toBytes();
}

/** BMD0 file with one MDL0 block holding one model. */
export function buildModel(spec: ModelSpec): Uint8Array {
  const posScale = spec.posScale ?? 1;
  const nodeDatas = spec.nodes.map(nodeData);
  const nodeDictLength = buildDictionary(spec.nodes.map((n) => ({ name: n.name, data: new Uint8Array(4) })), 4).length;
  const nodeAt: number[] = [];
  let cursor = nodeDictLength;
  for (const data of nodeDatas) {
    nodeAt.push(cursor);
    cursor += data.length;
  }
  const nodes = new ByteWriter().raw(buildDictionary(spec.nodes.map((n, i) => ({ name: n.name, data: u32Bytes(nodeAt[i]!) })), 4));
  for (const data of nodeDatas) nodes.raw(data);
  nodes.align(4);

  const sbc = new ByteWriter();
  for (const b of spec.sbc) sbc.u8(b);
  sbc.align(4);
  const materials = materialSection(spec.materials);
  const shapes = shapeSection(spec.shapes);

  const sbcAt = 0x40 + nodes.length;
  const matAt = sbcAt + sbc.length;
  const shpAt = matAt + materials.length;
  const model = new ByteWriter()
    .u32(shpAt + shapes.length).u32(sbcAt).u32(matAt).u32(shpAt).u32(0)
    .u8(0).u8(0).u8(0).u8(spec.nodes.length).u8(spec.materials.length).u8(spec.shapes.length).u8(0).u8(0)
    .u32(fx32(posScale)).u32(fx32(1 / posScale))
    .u16(0).u16(0).u16(0).u16(0)
    .u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u32(fx32(1)).u32(fx32(1))
    .raw(nodes.toBytes()).raw(sbc.toBytes()).raw(materials).raw(shapes);

  const modelDict = buildDictionary([{ name: spec.name, data: new Uint8Array(4) }], 4);
  const mdl = new ByteWriter().raw(buildDictionary([{ name: spec.name, data: u32Bytes(8 + modelDict.length) }], 4)).raw(model.toBytes());
  return buildNitroFile("BMD0", [buildBlock("MDL0", mdl.toBytes())]);
}

export interface TextureSpec {
  name: string;
  /** 1 A3I5, 2 four colors, 3 sixteen colors, 4 256 colors, 6 A5I3. */
  format: number;
  width: number;
  height: number;
  /** Texel bytes exactly as stored. */
  texels: Uint8Array;
  color0Transparent?: boolean;
}

export interface PaletteSpec {
  name: string;
  /** BGR555 colors. */
  colors: number[];
}

/** TEX0 block (0x3c-byte header, texture and palette dictionaries, texel and palette data). */
export function buildTex0(textures: TextureSpec[], palettes: PaletteSpec[]): Uint8Array {
  const texData = new ByteWriter();
  const texEntries = textures.map((t) => {
    texData.align(8);
    const offset = texData.length;
    texData.raw(t.texels);
    const params =
      (offset >> 3) |
      (Math.log2(t.width / 8) << 20) |
      (Math.log2(t.height / 8) << 23) |
      (t.format << 26) |
      ((t.color0Transparent ? 1 : 0) << 29);
    return { name: t.name, data: new ByteWriter().u32(params).u32(0).toBytes() };
  });
  texData.align(8);
  const palData = new ByteWriter();
  const palEntries = palettes.map((p) => {
    palData.align(8);
    const offset = palData.length;
    for (const c of p.colors) palData.u16(c);
    return { name: p.name, data: new ByteWriter().u16(offset >> 3).u16(0).toBytes() };
  });
  palData.align(8);

  const texDict = buildDictionary(texEntries, 8);
  const palDict = buildDictionary(palEntries, 4);
  const texDictAt = 0x3c;
  const palDictAt = texDictAt + texDict.length;
  const texDataAt = palDictAt + palDict.length;
  const palDataAt = texDataAt + texData.length;

  const w = new ByteWriter();
  w.ascii("TEX0").u32(0).u32(0).u16(texData.length >> 3).u16(texDictAt).u32(0).u32(texDataAt).u32(0);
  w.u16(0).u16(0).u32(0).u32(palDataAt).u32(palDataAt).u32(0);
  w.u32(palData.length >> 3).u32(palDictAt).u32(palDataAt);
  w.raw(texDict).raw(palDict).raw(texData.toBytes()).raw(palData.toBytes());
  w.setU32(4, w.length);
  return w.toBytes();
}
