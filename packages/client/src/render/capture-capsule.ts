import { CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, TorusGeometry } from "three";

// The capture capsule: an original 3D catching device drawn in place of a wild Pokémon while a capture
// plays (spec 015). An upright pill with silver caps, a glowing ring at its waist and three fins at its base.
// Sizes are map pixels; the group's origin is the ground point under it.

const BODY = 0x2a9d8f;
const CAP = 0xc9d1d9;
const FIN = 0x264653;
const RING_IDLE = 0xffb703;
const RING_CAUGHT = 0x8bff7a;
const RING_ESCAPED = 0xff5d5d;

/** How long the capsule takes to land, in ms, before its first shake. */
const LAND_MS = 220;
const DROP_PX = 18;
/** The rock angle of a shake, in radians. */
const ROCK = 0.45;

export type Capsule = { root: Group; ring: MeshBasicMaterial; dispose(): void };

export function createCapsule(): Capsule {
  const root = new Group();
  const tilt = new Group();
  tilt.name = "tilt";
  root.add(tilt);
  const lambert = (color: number) => new MeshLambertMaterial({ color });
  const body = new Mesh(new CapsuleGeometry(3.2, 5, 4, 12), lambert(BODY));
  body.position.y = 6.4;
  const capTop = new Mesh(new CylinderGeometry(2.2, 2.8, 1.2, 12), lambert(CAP));
  capTop.position.y = 12.4;
  const capBottom = new Mesh(new CylinderGeometry(2.8, 2.2, 1.2, 12), lambert(CAP));
  capBottom.position.y = 0.6;
  const ring = new MeshBasicMaterial({ color: RING_IDLE });
  const band = new Mesh(new TorusGeometry(3.4, 0.6, 6, 16), ring);
  band.rotation.x = Math.PI / 2;
  band.position.y = 6.4;
  tilt.add(body, capTop, capBottom, band);
  for (let i = 0; i < 3; i++) {
    const fin = new Mesh(new ConeGeometry(1.1, 3, 3), lambert(FIN));
    const a = (i * Math.PI * 2) / 3;
    fin.position.set(Math.cos(a) * 3.1, 1.6, Math.sin(a) * 3.1);
    fin.rotation.set(0, -a, Math.PI);
    tilt.add(fin);
  }
  for (const m of tilt.children) m.castShadow = true;
  return {
    root,
    ring,
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (o.material as MeshBasicMaterial).dispose();
        }
      });
      root.removeFromParent();
    },
  };
}

/**
 * Poses the capsule `elapsed` ms into a capture of `shakes` shakes (each `shakeMs` long, rocking in its first
 * half), then the result window: the ring turns green when caught, red when it breaks open.
 */
export function poseCapsule(c: Capsule, elapsed: number, shakes: number, shakeMs: number, caught: boolean | undefined): void {
  const tilt = c.root.getObjectByName("tilt")!;
  // Landing: a drop with a spin, then a small squash.
  const land = Math.min(1, elapsed / LAND_MS);
  tilt.position.y = DROP_PX * (1 - land) * (1 - land);
  tilt.rotation.y = elapsed < LAND_MS ? (1 - land) * Math.PI * 3 : Math.sin(elapsed / 900) * 0.2;
  const squash = elapsed >= LAND_MS && elapsed < LAND_MS + 120 ? 1 - Math.sin(((elapsed - LAND_MS) / 120) * Math.PI) * 0.15 : 1;
  tilt.scale.set(2 - squash, squash, 2 - squash);
  const inShake = elapsed < shakes * shakeMs && elapsed % shakeMs < shakeMs / 2;
  tilt.rotation.z = inShake ? Math.sin(((elapsed % shakeMs) / (shakeMs / 2)) * Math.PI * 2) * ROCK : 0;
  const result = elapsed >= shakes * shakeMs;
  const pulse = 0.65 + 0.35 * Math.sin(elapsed / 90);
  const color = result && caught !== undefined ? (caught ? RING_CAUGHT : RING_ESCAPED) : RING_IDLE;
  c.ring.color.setHex(color).multiplyScalar(result ? 1 : pulse);
}
