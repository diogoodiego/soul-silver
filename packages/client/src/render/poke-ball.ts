import { type BufferGeometry, CylinderGeometry, Group, Mesh, MeshPhongMaterial, SphereGeometry, type Material } from "three";

// The Poké Ball, procedural, from the developer's technical drawing (millimetres): a Ø50 sphere 52 tall,
// red top shell and white bottom shell split by a black band, a Ø16 button on the front (+Z) and the hinge
// pin at the back (-Z). The top shell and its half of the band sit in `lid`, pivoting on the hinge pin.
// Built in mm and scaled to map pixels; the group's origin is the ground point under the ball.

/** The ball's diameter in map pixels. */
export const BALL_PX = 8;
const MM = BALL_PX / 50;
const R = 25;
/** The drawing's 52 mm height over the 50 mm diameter. */
const TALL = 52 / 50;
const BAND_MM = 3;
/** Polar angle where each shell stops at the band's edge. */
const SHELL_EDGE = Math.PI / 2 - Math.asin(BAND_MM / 2 / R);

const RED = 0xd62a2a;
const WHITE = 0xf2f2f2;
const BLACK = 0x1c1c1c;
const BUTTON_IDLE = 0xffffff;
const BUTTON_CAUGHT = 0x8bff7a;
const BUTTON_ESCAPED = 0xff5d5d;

/** How long the ball takes to land, in ms, before its first shake. */
const LAND_MS = 220;
const DROP_PX = 18;
/** The rock angle of a shake, in radians. */
const ROCK = 0.45;

export type PokeBall = { root: Group; button: MeshPhongMaterial; dispose(): void };

export function createPokeBall(): PokeBall {
  const root = new Group();
  const tilt = new Group();
  tilt.name = "tilt";
  root.add(tilt);
  const body = new Group();
  body.name = "body";
  body.scale.setScalar(MM);
  body.position.y = (R * TALL + 0.5) * MM;
  tilt.add(body);

  const plastic = (color: number) => new MeshPhongMaterial({ color, shininess: 80, specular: 0x555555 });
  const red = plastic(RED);
  const white = plastic(WHITE);
  const black = new MeshPhongMaterial({ color: BLACK, shininess: 20 });
  const button = plastic(BUTTON_IDLE);

  const lid = new Group();
  lid.name = "lid";
  lid.position.z = -R;
  body.add(lid);
  const top = new Mesh(new SphereGeometry(R, 32, 12, 0, Math.PI * 2, 0, SHELL_EDGE), red);
  top.scale.y = TALL;
  top.position.z = R;
  const bottom = new Mesh(new SphereGeometry(R, 32, 12, 0, Math.PI * 2, Math.PI - SHELL_EDGE, SHELL_EDGE), white);
  bottom.scale.y = TALL;
  const band = new Mesh(new CylinderGeometry(R - 0.4, R - 0.4, BAND_MM + 1, 32), black);
  lid.add(top);
  body.add(bottom, band);

  // The button: a black bezel through the band, the Ø16 white ring and the pressable centre.
  const face = (radius: number, depth: number, z: number, material: Material) => {
    const m = new Mesh(new CylinderGeometry(radius, radius, depth, 24), material);
    m.rotation.x = Math.PI / 2;
    m.position.z = z;
    body.add(m);
  };
  face(10, 4, R - 1.2, black);
  face(8, 4, R - 0.4, white);
  face(5, 4, R + 0.4, button);

  const hinge = new Mesh(new CylinderGeometry(1.6, 1.6, 9, 12), black);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.z = -R + 0.6;
  body.add(hinge);

  root.traverse((o) => {
    if (o instanceof Mesh) o.castShadow = true;
  });
  return {
    root,
    button,
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) (o.geometry as BufferGeometry).dispose();
      });
      for (const m of [red, white, black, button]) m.dispose();
      root.removeFromParent();
    },
  };
}

/** In flight: tumbling forward along `heading` (radians on the ground plane), `elapsed` ms into the throw. */
export function poseFlight(b: PokeBall, elapsed: number, heading: number): void {
  const tilt = b.root.getObjectByName("tilt")!;
  tilt.position.y = 0;
  tilt.rotation.set(0, heading, 0);
  tilt.scale.setScalar(1);
  b.root.getObjectByName("body")!.rotation.x = elapsed / 60;
}

/**
 * Poses the ball `elapsed` ms into a capture of `shakes` shakes (each `shakeMs` long, rocking in its first
 * half), then the result window: the button turns green when caught, red when it breaks open.
 */
export function poseCapture(b: PokeBall, elapsed: number, shakes: number, shakeMs: number, caught: boolean | undefined): void {
  const tilt = b.root.getObjectByName("tilt")!;
  b.root.getObjectByName("body")!.rotation.x = 0;
  // Landing: a drop with a spin, then a small squash.
  const land = Math.min(1, elapsed / LAND_MS);
  tilt.position.y = DROP_PX * (1 - land) * (1 - land);
  tilt.rotation.y = elapsed < LAND_MS ? (1 - land) * Math.PI * 3 : 0;
  const squash = elapsed >= LAND_MS && elapsed < LAND_MS + 120 ? 1 - Math.sin(((elapsed - LAND_MS) / 120) * Math.PI) * 0.15 : 1;
  tilt.scale.set(2 - squash, squash, 2 - squash);
  poseShakes(b, elapsed, shakes, shakeMs, caught);
}

/** The drawing's widest opening. */
export const LID_OPEN = (110 * Math.PI) / 180;

/** Opens the top shell on its hinge pin: 0 closed, LID_OPEN wide open. */
export function setLid(b: PokeBall, angle: number): void {
  b.root.getObjectByName("lid")!.rotation.x = -angle;
}

/** Rocks `elapsed` ms into `shakes` shakes (in the first half of each), then lights the button with the result. */
export function poseShakes(b: PokeBall, elapsed: number, shakes: number, shakeMs: number, caught: boolean | undefined): void {
  const tilt = b.root.getObjectByName("tilt")!;
  const inShake = elapsed < shakes * shakeMs && elapsed % shakeMs < shakeMs / 2;
  tilt.rotation.z = inShake ? Math.sin(((elapsed % shakeMs) / (shakeMs / 2)) * Math.PI * 2) * ROCK : 0;
  const result = elapsed >= shakes * shakeMs;
  const pulse = 0.65 + 0.35 * Math.sin(elapsed / 90);
  const color = result && caught !== undefined ? (caught ? BUTTON_CAUGHT : BUTTON_ESCAPED) : BUTTON_IDLE;
  b.button.color.setHex(color);
  b.button.emissive.setHex(color).multiplyScalar(result ? 0.6 : 0.3 * pulse);
}
