import { spriteName, type SpriteEntry } from "@soulsilver/shared/sprites";
import type { BattleResult } from "./battle.ts";
import { readSpaEmitters, readSpaTextures, type SpaEmitter } from "./spa.ts";
import type { FrameInput } from "./writer.ts";

// Battle effects (spec 013 refinement): the ROM's particle textures and emitters, per move and per
// status. Move scripts are scanned for two commands only:
//   51 slot spa 1        load SPA file `spa` into `slot`
//   46 slot emitter mode create emitter `emitter` of the SPA in `slot`, placed by `mode` (see AT)
// shortcut: a word scan, not a script VM; camera, background and sprite-movement commands are ignored.
const LOAD = 51;
const CREATE = 46;
/** Emitter placement by mode, checked against known moves: 3 Growl and Swords Dance on the user, 4 Tackle on
 * the target, 17 Ember and Flamethrower flying from the user to the target.
 * shortcut: the rare modes 0, 19, 20 and 60 are treated as "attacker" until they are decoded. */
export function placement(mode: number): "attacker" | "target" | "travel" {
  return mode === 4 ? "target" : mode === 17 ? "travel" : "attacker";
}

/** Status animations: battle-effect scripts (a/0/6/1) 3, 2, 5, 1, 4 and 6, read once from the ROM. */
export const STATUS_EFFECTS: Record<string, { spa: number; emitters: number[] }> = {
  burn: { spa: 27, emitters: [2] },
  poison: { spa: 27, emitters: [7] },
  toxic: { spa: 27, emitters: [7] },
  paralysis: { spa: 115, emitters: [1] },
  sleep: { spa: 27, emitters: [9] },
  freeze: { spa: 27, emitters: [6] },
  confusion: { spa: 27, emitters: [5] },
};

/** (spa, emitter) pairs a move animation script creates, in script order, without repeats. */
export function scriptEmitters(script: Uint8Array): Array<{ spa: number; emitter: number; at?: ReturnType<typeof placement> }> {
  const words = new Uint32Array(script.buffer.slice(script.byteOffset, script.byteOffset + (script.byteLength & ~3)));
  const slots = new Map<number, number>();
  const out: Array<{ spa: number; emitter: number; at?: ReturnType<typeof placement> }> = [];
  for (let i = 0; i + 3 < words.length; i++) {
    const [op, slot, arg, last] = [words[i]!, words[i + 1]!, words[i + 2]!, words[i + 3]!];
    if (slot > 3 || arg > 0xffff) continue;
    if (op === LOAD && last <= 1) slots.set(slot, arg);
    else if (op === CREATE && slots.has(slot)) {
      const spa = slots.get(slot)!;
      const at = placement(last);
      if (!out.some((p) => p.spa === spa && p.emitter === arg && p.at === at)) out.push({ spa, emitter: arg, at });
    }
  }
  return out;
}

export async function extractBattleFx(
  readScript: (move: number) => Promise<Uint8Array>,
  readSpa: (spa: number) => Promise<Uint8Array>,
  moves: number,
): Promise<BattleResult> {
  const result: BattleResult = { frames: [], sprites: [], missing: [], failed: [] };
  const spas = new Map<number, { textures: FrameInput["image"][]; emitters: SpaEmitter[] } | Error>();
  const frames = new Set<string>();

  const spa = async (id: number) => {
    if (!spas.has(id)) {
      try {
        const bytes = await readSpa(id);
        spas.set(id, { textures: readSpaTextures(bytes, `spa ${id}`), emitters: readSpaEmitters(bytes, `spa ${id}`) });
      } catch (error) {
        spas.set(id, error as Error);
      }
    }
    return spas.get(id)!;
  };

  const build = async (sprite: string, pairs: Array<{ spa: number; emitter: number; at?: ReturnType<typeof placement> }>, extra: Partial<SpriteEntry>) => {
    const emitters: NonNullable<SpriteEntry["emitters"]> = [];
    for (const p of pairs) {
      const file = await spa(p.spa);
      if (file instanceof Error) throw file;
      const e = file.emitters[p.emitter];
      const image = e && file.textures[e.texture];
      if (!e || !image) throw new Error(`spa ${p.spa}: emissor ${p.emitter} ou a textura dele não existe`);
      const frame = spriteName("battle-fx", [p.spa, e.texture]);
      if (!frames.has(frame)) {
        frames.add(frame);
        result.frames.push({ name: frame, image, anchor: { x: image.width >> 1, y: image.height >> 1 } });
      }
      const { texture: _, ...rest } = e;
      emitters.push({ frame, ...rest, ...(p.at ? { at: p.at } : {}) });
    }
    result.sprites.push({ name: sprite, frames: [], animations: [], emitters, ...extra });
  };

  for (let move = 1; move <= moves; move++) {
    const sprite = spriteName("battle-fx", ["move", move]);
    try {
      const pairs = scriptEmitters(await readScript(move));
      if (pairs.length === 0) result.missing.push({ sprite, reason: "o script do golpe não cria partículas" });
      else await build(sprite, pairs, { move });
    } catch (error) {
      result.failed.push({ sprite, reason: (error as Error).message });
    }
  }
  for (const [status, effect] of Object.entries(STATUS_EFFECTS)) {
    const sprite = spriteName("battle-fx", ["status", status]);
    try {
      await build(sprite, effect.emitters.map((emitter) => ({ spa: effect.spa, emitter })), { status });
    } catch (error) {
      result.failed.push({ sprite, reason: (error as Error).message });
    }
  }
  return result;
}
