import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, type Scene, type Vector3 } from "three";

// The swap animation: a red beam leaves the trainer and the Pokémon forms out of it, red and small, growing to
// full size before it takes its own colours. Times in ms from the start.

export const SUMMON_MS = 600;
const BEAM_REACH_MS = 150;
const BEAM_END_MS = 300;
const FORM_START_MS = 120;
const FORM_END_MS = 420;
const RED_END_MS = 480;
const FORM_FROM = 0.15;

export interface SummonPhase {
  /** The lit stretch of the beam, as fractions of trainer → Pokémon; undefined once it is gone. */
  beam: { tail: number; head: number } | undefined;
  visible: boolean;
  scale: number;
  red: boolean;
  done: boolean;
}

export function summonPhase(elapsed: number): SummonPhase {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const beam = elapsed < BEAM_END_MS ? { tail: clamp((elapsed - BEAM_REACH_MS) / (BEAM_END_MS - BEAM_REACH_MS)), head: clamp(elapsed / BEAM_REACH_MS) } : undefined;
  const form = clamp((elapsed - FORM_START_MS) / (FORM_END_MS - FORM_START_MS));
  // Ease out: quick at first, settling into its size.
  const scale = form >= 1 ? 1 : FORM_FROM + (1 - FORM_FROM) * (1 - (1 - form) ** 3);
  return { beam, visible: elapsed >= FORM_START_MS, scale, red: elapsed < RED_END_MS, done: elapsed >= SUMMON_MS };
}

/** The beam: a bright core in a wider glow, drawn over the scene, as a flat ribbon between two points. */
export function createBeam(scene: Scene) {
  const ribbon = (color: number, opacity: number) => {
    const geometry = new BufferGeometry();
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ color, transparent: true, opacity, side: DoubleSide, depthTest: false, depthWrite: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    scene.add(mesh);
    return mesh;
  };
  const glow = ribbon(0xff2a2a, 0.35);
  const core = ribbon(0xffd0d0, 0.95);
  const place = (mesh: Mesh, a: Vector3, b: Vector3, half: number) => {
    // Across the beam on the ground plane; a beam straight down the screen still has width along x.
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const [px, pz] = len > 0.01 ? [(-dz / len) * half, (dx / len) * half] : [half, 0];
    const pos = mesh.geometry.getAttribute("position") as BufferAttribute;
    pos.set([a.x + px, a.y + half, a.z + pz, a.x - px, a.y - half, a.z - pz, b.x + px, b.y + half, b.z + pz, b.x - px, b.y - half, b.z - pz]);
    pos.needsUpdate = true;
  };
  return {
    /** Lights the stretch from `a` to `b`; `width` in map pixels. */
    set(a: Vector3, b: Vector3, width: number) {
      place(glow, a, b, width);
      place(core, a, b, width / 3);
      glow.visible = core.visible = true;
    },
    dispose() {
      for (const m of [glow, core]) {
        m.removeFromParent();
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
