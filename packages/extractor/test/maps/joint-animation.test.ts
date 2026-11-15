import { describe, expect, it } from "vitest";
import { readJointPose } from "../../src/maps/joint-animation.ts";

// Spec 030.5: the pose a BCA0 joint animation leaves, from a synthetic file (principle II). The Azalea Gym's
// rope animations are of this shape: per node a u16 flags word (bit 0: untouched; translation, rotation and
// scale each identity or constant), then the constant values: fx32 x, y, z, and per scale axis fx32 value and inverse.

const FX = 4096;
const UNTOUCHED = 0x3b7b;
const CONST_T_S = 0x3978;
const ANIMATED_T = 0x3970; // translation x, y and z read from frame data: not constant

type Node = { flags: number; t?: [number, number, number]; s?: [number, number, number] } | null;

function bca0(nodes: Node[]): Uint8Array {
  const jac = 0x44;
  const objects = nodes.map((n) => (n?.t ? 4 + 12 + 24 : 4));
  const objectsAt = jac + 0x14 + Math.ceil((nodes.length * 2) / 4) * 4;
  const size = objectsAt + objects.reduce((a, b) => a + b, 0);
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  b.set([..."BCA0"].map((c) => c.charCodeAt(0)), 0);
  v.setUint16(4, 0xfeff, true);
  v.setUint32(8, size, true);
  v.setUint16(12, 0x10, true);
  v.setUint16(14, 1, true);
  v.setUint32(16, 0x14, true);
  b.set([..."JNT0"].map((c) => c.charCodeAt(0)), 0x14);
  v.setUint32(0x18, size - 0x14, true);
  // Dictionary at 0x1c: one entry, its info 0x10 further on: entry size 4, names 8 past the info, then the data.
  b[0x1d] = 1;
  v.setUint16(0x22, 0x10, true);
  v.setUint16(0x2c, 4, true);
  v.setUint16(0x2e, 8, true);
  v.setUint32(0x30, jac - 0x14, true);
  b.set([..."ropeA"].map((c) => c.charCodeAt(0)), 0x34);
  b.set([0x4a, 0, 0x41, 0x43], jac);
  v.setUint16(jac + 4, 3, true);
  v.setUint16(jac + 6, nodes.length, true);
  let at = objectsAt;
  nodes.forEach((n, i) => {
    v.setUint16(jac + 0x14 + i * 2, at - jac, true);
    v.setUint16(at, n?.flags ?? UNTOUCHED, true);
    b[at + 3] = i;
    if (n?.t) {
      n.t.forEach((t, k) => v.setInt32(at + 4 + k * 4, t * FX, true));
      n.s!.forEach((s, k) => {
        v.setInt32(at + 16 + k * 8, s * FX, true);
        v.setInt32(at + 20 + k * 8, s === 0 ? 0 : FX / s, true);
      });
    }
    at += objects[i]!;
  });
  return b;
}

describe("readJointPose", () => {
  it("gives each animated node its constant translation and scale; untouched nodes are left out", () => {
    const pose = readJointPose(bca0([null, { flags: CONST_T_S, t: [0, -9, 0], s: [0, 0, 0] }, null]));
    expect([...pose.keys()]).toEqual([1]);
    expect(pose.get(1)).toEqual([0, 0, 0, 0, 0, 0, 0, -9, 0, 0, 0, 0]);
  });

  it("refuses tracks that change over the frames, which it does not read", () => {
    expect(() => readJointPose(bca0([{ flags: ANIMATED_T, t: [1, 2, 3], s: [1, 1, 1] }]))).toThrow(/BCA0.*ropeA.*nó 0/);
  });
});
