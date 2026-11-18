import {
  AmbientLight,
  type BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Shape,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { quadTransform } from "./quad-transform";

// The settings screen's Pokédex: a procedural 3D model whose screen carries the settings as HTML,
// warped onto the projected screen every frame so focus, the pad and text fields keep working.

/** The HTML screen's own size in CSS pixels, at the 3D screen's aspect. */
export const DEX_SCREEN_W = 880;
export const DEX_SCREEN_H = 555;
/** The tab strip above the screen, and where its diagonal reaches the top, in screen CSS pixels. */
export const DEX_STRIP_H = 55;
export const DEX_STRIP_LEFT = 185;

// Model units (100 screen CSS pixels each). The screen, tab strip included, is the box the HTML lands on.
const SCREEN = { left: -4.4, right: 4.4, top: 2.55, bottom: -3.0 };
const STRIP = { bottom: 2.0, diagonal: -3.1 };
/** A narrow red border around the screen (the bevel adds a little); more room on top for the lens. */
const BORDER = 0.14;
/** The screen's rounded corners. */
const GLASS_RADIUS = 0.2;
const BODY = { left: SCREEN.left - BORDER, right: SCREEN.right + BORDER, top: 3.35, bottom: SCREEN.bottom - BORDER, depth: 0.7, bevel: 0.05 };
const FRONT = BODY.depth / 2 + BODY.bevel;
const ENTRY_MS = 700;

function roundedRect(left: number, right: number, bottom: number, top: number, r: number): Shape {
  const s = new Shape();
  s.moveTo(left + r, bottom);
  s.lineTo(right - r, bottom);
  s.quadraticCurveTo(right, bottom, right, bottom + r);
  s.lineTo(right, top - r);
  s.quadraticCurveTo(right, top, right - r, top);
  s.lineTo(left + r, top);
  s.quadraticCurveTo(left, top, left, top - r);
  s.lineTo(left, bottom + r);
  s.quadraticCurveTo(left, bottom, left + r, bottom);
  return s;
}

/** A flat slab of `shape` from z to z + depth. */
function slab(shape: Shape, z: number, depth: number, bevel = 0): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, z);
  return g;
}

function buildModel(): { root: Group; dispose: () => void } {
  const root = new Group();
  // Lacquered shell and glass: a clear coat over each picks up the environment's reflections.
  const red = new MeshPhysicalMaterial({ color: 0xc8102e, roughness: 0.42, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.12 });
  const black = new MeshPhysicalMaterial({ color: 0x141414, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.05 });
  const white = new MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 });
  const blue = new MeshStandardMaterial({ color: 0x1557a8, roughness: 0.15, metalness: 0.2, emissive: 0x06224a });
  const ledRed = new MeshStandardMaterial({ color: 0xff3b3b, emissive: 0x801010 });
  const ledWhite = new MeshStandardMaterial({ color: 0xffffff, emissive: 0x404040 });
  const materials = [red, black, white, blue, ledRed, ledWhite];
  const geometries: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, material: MeshStandardMaterial, at?: [number, number, number]) => {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    if (at) mesh.position.set(...at);
    root.add(mesh);
    return mesh;
  };

  add(slab(roundedRect(BODY.left, BODY.right, BODY.bottom, BODY.top, 0.35), -BODY.depth / 2, BODY.depth, BODY.bevel), red);
  // The screen under the HTML; its tab strip rises past a diagonal, leaving the lens corner red.
  const { left: l, right: r, top: t, bottom: b } = SCREEN;
  const g = STRIP.bottom;
  const glass = new Shape();
  glass.moveTo(l + GLASS_RADIUS, b);
  glass.lineTo(r - GLASS_RADIUS, b);
  glass.quadraticCurveTo(r, b, r, b + GLASS_RADIUS);
  glass.lineTo(r, t - GLASS_RADIUS);
  glass.quadraticCurveTo(r, t, r - GLASS_RADIUS, t);
  glass.lineTo(STRIP.diagonal + (t - g), t);
  glass.lineTo(STRIP.diagonal, g);
  glass.lineTo(l + GLASS_RADIUS, g);
  glass.quadraticCurveTo(l, g, l, g - GLASS_RADIUS);
  glass.lineTo(l, b + GLASS_RADIUS);
  glass.quadraticCurveTo(l, b, l + GLASS_RADIUS, b);
  add(slab(glass, FRONT, 0.03), black);
  // Lens: white ring and a glossy blue dome, top left.
  add(new CylinderGeometry(0.5, 0.5, 0.08, 40), white, [-3.9, 2.78, FRONT + 0.04]).rotation.x = Math.PI / 2;
  add(new SphereGeometry(0.4, 32, 16), blue, [-3.9, 2.78, FRONT + 0.08]).scale.z = 0.45;
  // Three small lights beside it, above the strip.
  [ledRed, ledWhite, black].forEach((m, i) => add(new SphereGeometry(0.09, 16, 8), m, [-2.9 + i * 0.3, 3.0, FRONT + 0.02]));

  return {
    root,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/** Mounts the Pokédex in `host` and keeps `screen` (DEX_SCREEN_W × DEX_SCREEN_H) on its screen; returns the teardown. */
export function createPokedex(host: HTMLElement, screen: HTMLElement): () => void {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  host.prepend(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 1, 200);
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(4, 6, 10);
  scene.add(new AmbientLight(0xffffff, 0.8), sun);
  // A soft studio room to reflect: highlights slide over the shell and glass as it sways.
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  // Colour management is off and there is no tone mapping, so the room reflects at full strength: only a hint of it.
  scene.environmentIntensity = 0.12;
  const model = buildModel();
  scene.add(model.root);

  let size = { w: 1, h: 1 };
  const fit = () => {
    size = { w: host.clientWidth || 1, h: host.clientHeight || 1 };
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    // Room for the whole body and a margin, whichever axis is tighter.
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const w = BODY.right - BODY.left + 1.4;
    const h = BODY.top - BODY.bottom + 1.4;
    camera.position.set(0, 0, Math.max(h / 2 / half, w / 2 / (half * camera.aspect)));
    camera.updateProjectionMatrix();
    // How much the projection scales the screen's CSS px at rest: the screen divides its font size by it, so
    // its text matches the other menus' (the entry and sway are left out, or the text would pulse).
    const width = ((SCREEN.right - SCREEN.left) * size.h) / (2 * half * (camera.position.z - FRONT - 0.03));
    screen.style.setProperty("--dex-scale", String(width / DEX_SCREEN_W));
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();

  screen.style.position = "absolute";
  screen.style.left = "0";
  screen.style.top = "0";
  screen.style.transformOrigin = "0 0";
  const corners = [
    new Vector3(SCREEN.left, SCREEN.top, FRONT + 0.03),
    new Vector3(SCREEN.right, SCREEN.top, FRONT + 0.03),
    new Vector3(SCREEN.right, SCREEN.bottom, FRONT + 0.03),
    new Vector3(SCREEN.left, SCREEN.bottom, FRONT + 0.03),
  ];
  const point = new Vector3();
  const centre = -(BODY.top + BODY.bottom) / 2;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();

  renderer.setAnimationLoop((now: number) => {
    const s = (now - start) / 1000;
    // Rises and opens towards the player, then sways a little.
    const k = still ? 1 : Math.min(1, (now - start) / ENTRY_MS);
    const ease = 1 - (1 - k) ** 3;
    const sway = still ? 0 : 1;
    model.root.position.y = centre - (1 - ease) * 9;
    model.root.rotation.x = (1 - ease) * 0.6 + sway * 0.025 * Math.sin(s * 0.7);
    model.root.rotation.y = sway * 0.05 * Math.sin(s * 0.45);
    model.root.updateMatrixWorld();
    const [a, b, c, d] = corners.map((corner): [number, number] => {
      point.copy(corner).applyMatrix4(model.root.matrixWorld).project(camera);
      return [((point.x + 1) / 2) * size.w, ((1 - point.y) / 2) * size.h];
    }) as [[number, number], [number, number], [number, number], [number, number]];
    screen.style.transform = `matrix3d(${quadTransform(DEX_SCREEN_W, DEX_SCREEN_H, [a, b, c, d]).join(",")})`;
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    observer.disconnect();
    model.dispose();
    scene.environment?.dispose();
    room.dispose();
    pmrem.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
