import { AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, ShaderMaterial, type Scene } from "three";
import { OBLIQUE } from "./camera";

// Flamethrower (move 53) drawn by three.js instead of the ROM's particles: a stream of soft flame puffs
// leaving the user's mouth along the aim, fanning out and swelling as they fly, and cooling as they go:
// white-hot at the mouth's core, yellow around it, red at the edges and far out; and a warm light thrown on the ground around it. The map is never lit (its
// materials are unlit), so the light is a glow added over the ground. Its reach is the beam archetype's
// 128 px (content/combat/archetypes.json).

export const FLAMETHROWER_MOVE = 53;
export const FLAME_REACH_PX = 128;
/** How long the user breathes fire, and how long each puff lives. */
const BREATH_MS = 650;
const LIFE_MS = 420;
const SPAWN_EVERY_MS = 5;
const MAX_PUFFS = 192;
/** The mouth: about mid-height of an overworld Pokémon, as the ROM particles. */
const MOUTH_PX = 11;
/** Same as the particles' depth bias: the fire covers the Pokémon it plays on. */
const DEPTH_BIAS = 10;
/** The light on the ground: how far past the reach and how wide it spreads, and its rise and fall. */
const LIGHT_LENGTH_PX = FLAME_REACH_PX + 80;
const LIGHT_WIDTH_PX = 120;
const LIGHT_IN_MS = 90;
const LIGHT_OUT_MS = 300;

export interface FlameSeed {
  /** -1..1: which side of the stream, and how far out, the puff drifts; 0 is its core. */
  spread: number;
  /** 0..1: how far it carries. */
  jitter: number;
  /** Its flicker's phase. */
  phase: number;
}

/** A puff at age `t` (0..1): its distance down the stream, its drift sideways, its height and size, in px. */
export function flameAt(s: FlameSeed, t: number) {
  const along = FLAME_REACH_PX * (1 - (1 - t) ** 2) * (0.82 + 0.18 * s.jitter);
  const side = s.spread * (1.5 + 14 * t);
  const lift = MOUTH_PX + 10 * t * t + Math.sin(s.phase + t * 14) * 1.5 * t;
  const size = 5 + 15 * t ** 0.8;
  return { along, side, lift, size };
}

/** Colour by heat, from dying red up to white-hot: [heat, r, g, b]. */
const HEAT_STOPS: [number, number, number, number][] = [
  [0, 0.55, 0.03, 0.02],
  [0.3, 0.95, 0.12, 0.03],
  [0.55, 1, 0.55, 0.08],
  [0.75, 1, 0.9, 0.3],
  [0.9, 1, 1, 0.92],
];

/** How hot a puff is (0..1): hottest leaving the mouth in the core, cooling with its age (its distance from
 * the mouth) and with its drift out to the edges. */
export function flameHeat(spread: number, t: number): number {
  return (1 - t) ** 1.2 * (1 - 0.65 * Math.min(1, Math.abs(spread)));
}

/** The puff's colour: white at the mouth's core, yellow around it, orange, then red at the edges and far out. */
export function flameColor(spread: number, t: number): { r: number; g: number; b: number } {
  const h = flameHeat(spread, t);
  const above = HEAT_STOPS.findIndex(([at]) => at >= h);
  const i = above === -1 ? HEAT_STOPS.length - 1 : Math.max(1, above);
  const [lo, hi] = [HEAT_STOPS[i - 1]!, HEAT_STOPS[i]!];
  const k = Math.min(1, Math.max(0, (h - lo[0]) / (hi[0] - lo[0])));
  return { r: lo[1] + (hi[1] - lo[1]) * k, g: lo[2] + (hi[2] - lo[2]) * k, b: lo[3] + (hi[3] - lo[3]) * k };
}

/** Solid for most of its life, then gone. */
export function flameAlpha(t: number): number {
  return t <= 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
}

/** The ground light's strength, `ms` after the breath began: up fast, held while breathing, then down. */
export function lightLevel(ms: number): number {
  if (ms <= 0) return 0;
  if (ms < LIGHT_IN_MS) return ms / LIGHT_IN_MS;
  if (ms < BREATH_MS) return 1;
  return Math.max(0, 1 - (ms - BREATH_MS) / LIGHT_OUT_MS);
}

const PUFF_VERTEX = /* glsl */ `
  attribute vec4 tint;
  varying vec4 vTint;
  varying vec2 vUv;
  void main() {
    vTint = tint;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
/** A round puff, solid with a soft rim. */
const PUFF_FRAGMENT = /* glsl */ `
  varying vec4 vTint;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.55, d) * vTint.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vTint.rgb, a);
  }
`;
const LIGHT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
/** Warm light, strongest along the stream, falling off to nothing at the ellipse's rim. */
const LIGHT_FRAGMENT = /* glsl */ `
  uniform float level;
  varying vec2 vUv;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    float glow = pow(max(0.0, 1.0 - d), 1.6) * level;
    gl_FragColor = vec4(vec3(1.0, 0.42, 0.1) * glow * 0.9, 1.0);
  }
`;

type Point3 = { x: number; y: number; ground: number };
interface Breath {
  at: () => Point3 | undefined;
  dx: number;
  dy: number;
  start: number;
  spawned: number;
  light: Mesh<PlaneGeometry, ShaderMaterial>;
}
interface Puff {
  breath: Breath;
  born: number;
  seed: FlameSeed;
}

export function createFlamethrower(scene: Scene) {
  const geometry = new PlaneGeometry(1, 1);
  const tint = new InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(DynamicDrawUsage);
  geometry.setAttribute("tint", tint);
  const material = new ShaderMaterial({ vertexShader: PUFF_VERTEX, fragmentShader: PUFF_FRAGMENT, transparent: true, depthWrite: false });
  const mesh = new InstancedMesh(geometry, material, MAX_PUFFS);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  // The light lies flat on the ground: x along the stream, z across it.
  const lightGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const breaths: Breath[] = [];
  let puffs: Puff[] = [];
  const m = new Matrix4();

  function endBreath(b: Breath): void {
    b.light.removeFromParent();
    b.light.material.dispose();
  }

  function stop(): void {
    for (const b of breaths) endBreath(b);
    breaths.length = 0;
    puffs = [];
    mesh.count = 0;
  }

  return {
    /** Breathes fire from `at` (read every frame) along (dx, dy) on the ground. */
    play(at: () => Point3 | undefined, dir: { x: number; y: number }, now: number): void {
      const len = Math.hypot(dir.x, dir.y);
      const [dx, dy] = len > 0 ? [dir.x / len, dir.y / len] : [1, 0];
      const light = new Mesh(
        lightGeometry,
        new ShaderMaterial({ vertexShader: LIGHT_VERTEX, fragmentShader: LIGHT_FRAGMENT, uniforms: { level: { value: 0 } }, transparent: true, depthWrite: false, blending: AdditiveBlending }),
      );
      light.rotation.y = Math.atan2(-dy, dx);
      light.scale.set(LIGHT_LENGTH_PX, 1, LIGHT_WIDTH_PX);
      light.frustumCulled = false;
      scene.add(light);
      breaths.push({ at, dx, dy, start: now, spawned: 0, light });
    },
    update(now: number): void {
      for (let i = breaths.length - 1; i >= 0; i--) {
        const b = breaths[i]!;
        const due = Math.floor(Math.min(now - b.start, BREATH_MS) / SPAWN_EVERY_MS);
        for (; b.spawned < due; b.spawned++) {
          if (puffs.length >= MAX_PUFFS) continue;
          puffs.push({ breath: b, born: b.start + b.spawned * SPAWN_EVERY_MS, seed: { spread: Math.random() * 2 - 1, jitter: Math.random(), phase: Math.random() * Math.PI * 2 } });
        }
        const from = b.at();
        if (!from || now - b.start > BREATH_MS + LIFE_MS + LIGHT_OUT_MS) {
          endBreath(b);
          breaths.splice(i, 1);
          continue;
        }
        // Centred a little down the stream; it flickers as fire does.
        const flicker = 0.82 + 0.1 * Math.sin(now * 0.047) + 0.08 * Math.sin(now * 0.131 + 1.7);
        b.light.material.uniforms["level"]!.value = lightLevel(now - b.start) * flicker;
        b.light.position.set(from.x + b.dx * FLAME_REACH_PX * 0.45, from.ground + 0.5, from.y + b.dy * FLAME_REACH_PX * 0.45);
      }
      puffs = puffs.filter((p) => now - p.born < LIFE_MS && p.breath.at() !== undefined);
      // Coolest first, hottest last: the white and yellow heart stays on top of the red rim.
      const heat = (p: Puff) => flameHeat(p.seed.spread, (now - p.born) / LIFE_MS);
      const drawn = [...puffs].sort((a, b) => heat(a) - heat(b));
      drawn.forEach((p, i) => {
        const t = Math.max(0, (now - p.born) / LIFE_MS);
        const from = p.breath.at()!;
        const f = flameAt(p.seed, t);
        const { dx, dy } = p.breath;
        const x = from.x + dx * f.along - dy * f.side;
        const y = from.y + dy * f.along + dx * f.side;
        m.makeScale(f.size, f.size / OBLIQUE, 1).setPosition(x, from.ground + f.lift + DEPTH_BIAS, y + DEPTH_BIAS * OBLIQUE);
        mesh.setMatrixAt(i, m);
        const c = flameColor(p.seed.spread, t);
        tint.setXYZW(i, c.r, c.g, c.b, flameAlpha(t));
      });
      mesh.count = drawn.length;
      mesh.instanceMatrix.needsUpdate = true;
      tint.needsUpdate = true;
    },
    /** Puts every fire out at once. */
    stop,
    dispose(): void {
      stop();
      mesh.removeFromParent();
      geometry.dispose();
      lightGeometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
