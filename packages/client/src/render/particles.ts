import type { SpriteEmitter, SpriteSetFile } from "@soulsilver/shared/sprites";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, type Scene, type Texture } from "three";
import { OBLIQUE, SPRITE_DEPTH_BIAS } from "./camera";

// ROM battle particles (battle-fx sprite set) played in the world: each emitter spawns tinted
// billboards on the 30 fps clock of the original.
// shortcut: SPL units are mapped at UNIT_PX and emission is radial (straight up for statuses, whose emitters
// all are in the ROM); child emitters, spin,
// magnets and the scripts' camera moves are ignored. Revisit if a move looks wrong.

const FRAME_MS = 1000 / 30;
const UNIT_PX = 8;
/** ROM particles are sized for the big battle sprites; the world draws overworld-sized Pokémon. */
const SIZE = 0.5;
/** Punches and kicks (Mega Punch, Ice Punch, Mega Kick...): the ROM starts their fist or foot bigger than the Pokémon it lands on. */
const PUNCHES_AND_KICKS = new Set([4, 5, 7, 8, 9, 24, 25, 26, 27, 67, 136, 146, 167, 183, 223, 264, 299, 309, 325, 327, 359, 389, 409, 418]);
/** Longest side of their particles, in map pixels: half an ordinary Pokémon. */
const STRIKE_MAX_PX = 16;
/** Emitters with no life of their own (0) stop after this many frames. */
const DEFAULT_LIFE = 30;
/** Particles drawn above the ground point, about mid-height of a Pokémon. */
const LIFT_PX = 12;
/** Same idea as the sprites' depth bias, a bit more, so particles cover the Pokémon they play on. */
const DEPTH_BIAS = 10;

/**
 * Peak of a scale curve that starts and ends at 0, poison's in the ROM.
 * shortcut: the extraction keeps a curve's start and end, not its middle; extract that when an effect needs another peak.
 */
const ZERO_CURVE_PEAK = 0.8;

/** A status plays behind its Pokémon's sprite, rising from `lift` (world height over its feet; mid-height without one). */
export interface StatusPlay {
  lift?: (() => number | undefined) | undefined;
}

export interface ParticleFrame {
  frame: { x: number; y: number; w: number; h: number };
  page: Texture;
}

type Point3 = { x: number; y: number; ground: number };

interface Particle {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  def: SpriteEmitter;
  born: number;
  last: number;
  x: number;
  h: number;
  y: number;
  vx: number;
  vh: number;
  vy: number;
  /** Set for a status: where its Pokémon stands now, to stay behind its sprite and go with it. */
  behind: Running["at"] | undefined;
}

interface Running {
  defs: SpriteEmitter[];
  start: number;
  /** Fractional particles carried to the next emission. */
  owed: number[];
  last: number;
  at: () => Point3 | undefined;
  /** Travelling effects: where they fly to. */
  to?: (() => Point3 | undefined) | undefined;
  loop: boolean;
  status: StatusPlay | undefined;
}

/** Effect keys: `move/<id>` or `status/<id>`. */
export function effectsOf(set: SpriteSetFile): Map<string, SpriteEmitter[]> {
  const out = new Map<string, SpriteEmitter[]>();
  const sides = new Map(set.frames.map((f) => [f.name, Math.max(f.w, f.h)]));
  const capped = (e: SpriteEmitter): SpriteEmitter => {
    const max = STRIKE_MAX_PX / ((sides.get(e.frame) ?? 0) * e.scale * SIZE);
    return { ...e, scaleFrom: Math.min(e.scaleFrom, max), scaleTo: Math.min(e.scaleTo, max) };
  };
  for (const s of set.sprites) {
    if (!s.emitters) continue;
    if (s.move !== undefined) out.set(`move/${s.move}`, PUNCHES_AND_KICKS.has(s.move) ? s.emitters.map(capped) : s.emitters);
    if (s.status !== undefined) out.set(`status/${s.status}`, s.emitters);
  }
  return out;
}

const hex = (c: string) => new Color(Number.parseInt(c, 16));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function createParticles(scene: Scene, frameOf: (name: string) => ParticleFrame | undefined) {
  const live: Particle[] = [];
  const running = new Map<string, Running>();
  let next = 0;

  function spawn(def: SpriteEmitter, at: Point3, now: number, toward: Point3 | undefined, run: Running): void {
    const f = frameOf(def.frame);
    if (!f) return;
    const image = f.page.image as { width: number; height: number };
    const [u0, v0, u1, v1] = [f.frame.x / image.width, f.frame.y / image.height, (f.frame.x + f.frame.w) / image.width, (f.frame.y + f.frame.h) / image.height];
    const geometry = new BufferGeometry();
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    const [hw, hh] = [f.frame.w / 2, f.frame.h / 2 / OBLIQUE];
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([-hw, hh, 0, hw, hh, 0, -hw, -hh, 0, hw, -hh, 0]), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array([u0, v0, u1, v0, u0, v1, u1, v1]), 2));
    const material = new MeshBasicMaterial({ map: f.page, transparent: true, depthWrite: false, side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * def.radius * UNIT_PX;
    const speed = def.speed * UNIT_PX;
    const sideways = run.status ? 0 : speed;
    // A travelling emitter streams its particles to the target over their life.
    const life = Math.max(1, def.particleLife);
    const [fx, fy] = toward ? [(toward.x - at.x) / life, (toward.y - at.y) / life] : [0, 0];
    live.push({
      mesh,
      def,
      born: now,
      last: now,
      x: at.x + Math.cos(angle) * r,
      y: at.y + Math.sin(angle) * r * 0.5,
      h: at.ground + (run.status?.lift?.() ?? LIFT_PX),
      vx: Math.cos(angle) * sideways + fx,
      vy: Math.sin(angle) * sideways * 0.5 + fy,
      vh: speed * 0.5,
      behind: run.status && run.at,
    });
  }

  function emit(run: Running, now: number): boolean {
    const at = run.at();
    if (!at) return false;
    const frame = Math.floor((now - run.start) / FRAME_MS);
    let active = false;
    run.defs.forEach((def, k) => {
      const life = def.emitterLife || DEFAULT_LIFE;
      if (frame >= def.delay + life) return;
      active = true;
      for (let f = Math.max(run.last + 1, def.delay); f <= frame; f++) {
        if ((f - def.delay) % Math.max(1, def.interval) !== 0) continue;
        run.owed[k]! += def.count;
        const to = run.to?.();
        const t = Math.min(1, (f - def.delay) / life);
        const from = to ? { x: lerp(at.x, to.x, t), y: lerp(at.y, to.y, t), ground: lerp(at.ground, to.ground, t) } : at;
        for (; run.owed[k]! >= 1; run.owed[k]!--) spawn(def, from, now, to, run);
      }
    });
    run.last = frame;
    return active;
  }

  return {
    /** Plays an effect once; `at` is read every frame, and the effect stops when it returns undefined. `status` plays it as a status of the Pokémon there. */
    play(defs: SpriteEmitter[] | undefined, at: Running["at"], now: number, key = `once/${next++}`, loop = false, to?: Running["to"], status?: StatusPlay): void {

      if (!defs || defs.length === 0 || running.has(key)) return;
      running.set(key, { defs, start: now, owed: defs.map(() => 0), last: -1, at, loop, to, status });
    },
    stop(key: string): void {
      running.delete(key);
    },
    keys: () => running.keys(),
    update(now: number): void {
      for (const [key, run] of running) {
        if (emit(run, now)) continue;
        if (run.loop && run.at()) Object.assign(run, { start: now, last: -1, owed: run.defs.map(() => 0) });
        else running.delete(key);
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]!;
        const k = (now - p.born) / FRAME_MS / Math.max(1, p.def.particleLife);
        const stands = p.behind?.();
        if (k >= 1 || (p.behind && !stands)) {
          p.mesh.removeFromParent();
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
          live.splice(i, 1);
          continue;
        }
        const dt = (now - p.last) / FRAME_MS;
        p.last = now;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vh += p.def.gravityY * UNIT_PX * dt;
        p.h += p.vh * dt;
        const curve = p.def.scaleFrom === 0 && p.def.scaleTo === 0 ? ZERO_CURVE_PEAK * (1 - Math.abs(2 * k - 1)) : lerp(p.def.scaleFrom, p.def.scaleTo, k);
        const scale = p.def.scale * curve;
        p.mesh.scale.setScalar(Math.max(0.01, scale * SIZE));
        p.mesh.material.color = p.def.colorEnd ? hex(p.def.color).lerp(hex(p.def.colorEnd), k) : hex(p.def.color);
        p.mesh.material.opacity = p.def.alpha * (k < 0.7 ? 1 : (1 - k) / 0.3);
        const z = p.y + DEPTH_BIAS * OBLIQUE;
        // A standing sprite is a plane of constant z: a pixel north of it, the same screen point is farther all along.
        const plane = stands ? Math.min(z, stands.y + SPRITE_DEPTH_BIAS * OBLIQUE - 1) : z;
        p.mesh.position.set(p.x, p.h + DEPTH_BIAS - (z - plane) / OBLIQUE, plane);
      }
    },
    dispose(): void {
      for (const p of live) {
        p.mesh.removeFromParent();
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
      live.length = 0;
      running.clear();
    },
  };
}
