// The pose a BCA0 joint animation (a/1/0/6) leaves on a building's nodes (spec 030.5: the Azalea Gym's
// ropes, whose two poses each hide one stretch of thread). Only constant tracks are read: the gym's
// animations are 3 frames of one pose. Layout checked on the US ROM (files 25 to 28) and pokeheartgold.
import { readU16, readU32 } from "../binary.ts";
import { AnimationFormatError } from "./animation.ts";
import type { Matrix } from "./gx.ts";
import { readDictionary, readNitroBlocks } from "./nitro.ts";

const FX = 4096;
/** Per-node flags: bit 0 untouched; translation identity (1), base (2), x/y/z constant (3–5); rotation identity (6);
 *  scale identity (9), base (10), x/y/z constant (11–13). */
const UNTOUCHED = 1 << 0;
const T_IDENTITY = 1 << 1;
const T_BASE = 1 << 2;
const T_CONST = 0b111 << 3;
const R_IDENTITY = 1 << 6;
const S_IDENTITY = 1 << 9;
const S_BASE = 1 << 10;
const S_CONST = 0b111 << 11;

const fx32 = (b: Uint8Array, at: number) => (readU32(b, at) | 0) / FX;

/** Node index -> the node's matrix in the animation's pose (3×4, rows), for the nodes it moves. */
export function readJointPose(bytes: Uint8Array): Map<number, Matrix> {
  const jnt = readNitroBlocks(bytes, "BCA0").get("JNT0");
  if (jnt === undefined) throw new AnimationFormatError("BCA0 sem bloco JNT0");
  const [entry] = readDictionary(bytes, jnt + 8);
  if (!entry) throw new AnimationFormatError("BCA0 sem animação");
  const name = entry.name;
  const jac = jnt + readU32(entry.data, 0);
  const nodes = readU16(bytes, jac + 6);
  const pose = new Map<number, Matrix>();
  for (let i = 0; i < nodes; i++) {
    const at = jac + readU16(bytes, jac + 0x14 + i * 2);
    const flags = readU16(bytes, at);
    if (flags & UNTOUCHED) continue;
    const unsupported = (!(flags & T_IDENTITY) && ((flags & T_BASE) || (flags & T_CONST) !== T_CONST)) || !(flags & R_IDENTITY) || (!(flags & S_IDENTITY) && ((flags & S_BASE) || (flags & S_CONST) !== S_CONST));
    if (unsupported) throw new AnimationFormatError(`BCA0 ${name}: o nó ${i} tem trilhas que mudam por quadro ou rotação (flags 0x${flags.toString(16)}), que este leitor não lê`);
    let p = at + 4;
    let t = [0, 0, 0];
    if (!(flags & T_IDENTITY)) {
      t = [0, 1, 2].map((k) => fx32(bytes, p + k * 4));
      p += 12;
    }
    // Each constant scale is the value and its inverse.
    const s = flags & S_IDENTITY ? [1, 1, 1] : [0, 1, 2].map((k) => fx32(bytes, p + k * 8));
    pose.set(readU16(bytes, at + 2) >> 8, [s[0]!, 0, 0, t[0]!, 0, s[1]!, 0, t[1]!, 0, 0, s[2]!, t[2]!]);
  }
  return pose;
}
