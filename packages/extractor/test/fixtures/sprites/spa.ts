// Synthetic SPA particle files: `emitters` resources (header plus the optional blocks their flags
// ask for), then 8x8 16-colour SPT1 textures.

export interface SpaEmitterSpec {
  /** Optional-block flag bits (8 scale, 9 colour, 10 alpha, 11 tex anim, 16 child, 24–29 behaviours). */
  flags?: number;
  texture?: number;
  color?: number;
}

const BLOCK_SIZES: Record<number, number> = { 8: 12, 9: 12, 10: 8, 11: 12, 16: 20, 24: 8, 25: 8, 26: 16, 27: 4, 28: 8, 29: 16 };

export function buildSpa(emitters: SpaEmitterSpec[], textures: Array<{ colors: number[]; flip?: [s: boolean, t: boolean] }>): Uint8Array {
  const resources = emitters.map((e) => {
    const flags = e.flags ?? 0;
    const extra = Object.entries(BLOCK_SIZES).reduce((sum, [bit, size]) => sum + ((flags >>> Number(bit)) & 1 ? size : 0), 0);
    const r = new Uint8Array(0x58 + extra);
    const v = new DataView(r.buffer);
    v.setUint32(0, flags, true);
    v.setInt32(0x10, 0x1000, true); // one particle per emission
    v.setUint16(0x22, e.color ?? 0x7fff, true);
    v.setInt32(0x2c, 0x1000, true);
    v.setUint16(0x3c, 10, true);
    v.setUint16(0x3e, 20, true);
    v.setUint32(0x44, ((e.texture ?? 0) << 24) | (0x1f << 8) | 1, true);
    if ((flags >>> 9) & 1) {
      const color = 0x58 + ((flags >>> 8) & 1 ? 12 : 0);
      v.setUint16(color, 0x7fff, true);
      v.setUint16(color + 2, 0x001f, true);
    }
    return r;
  });
  const blocks = textures.map((t) => {
    const b = new Uint8Array(0x20 + 32 + t.colors.length * 2);
    const v = new DataView(b.buffer);
    b.set([0x20, 0x54, 0x50, 0x53]);
    // Format 3 (16 colours), 8x8, colour 0 transparent, flip bits.
    v.setUint32(4, 3 | (1 << 16) | (t.flip?.[0] ? 1 << 14 : 0) | (t.flip?.[1] ? 1 << 15 : 0), true);
    v.setUint32(8, 32, true);
    v.setUint32(0x0c, 0x40, true);
    v.setUint32(0x10, t.colors.length * 2, true);
    v.setUint32(0x1c, b.length, true);
    b.fill(0x11, 0x20, 0x40);
    t.colors.forEach((c, i) => v.setUint16(0x40 + i * 2, c, true));
    return b;
  });
  const resSize = resources.reduce((s, r) => s + r.length, 0);
  const texSize = blocks.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(0x20 + resSize + texSize);
  const v = new DataView(out.buffer);
  out.set([0x20, 0x41, 0x50, 0x53, 0x31, 0x32, 0x5f, 0x31]);
  v.setUint16(8, emitters.length, true);
  v.setUint16(0x0a, textures.length, true);
  v.setUint32(0x10, resSize, true);
  v.setUint32(0x14, texSize, true);
  v.setUint32(0x18, 0x20 + resSize, true);
  let at = 0x20;
  for (const part of [...resources, ...blocks]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A move script that loads `spa` into slot 0 and creates its emitter 0. */
export function buildMoveScript(spa: number): Uint8Array {
  return new Uint8Array(new Uint32Array([56, 51, 0, spa, 1, 46, 0, 0, 3, 4]).buffer);
}
