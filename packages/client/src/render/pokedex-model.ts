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
/** The phone's menu button on the red body, top right, between the screen and the body's top edge. */
const MENU_BUTTON = { x: SCREEN.right - 0.3, y: (BODY.top + SCREEN.top) / 2, half: 0.27 };
/** The menu button's own size in CSS pixels (100 per model unit, as the screen). */
export const DEX_BUTTON_PX = MENU_BUTTON.half * 200;
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

/** The screen's corners, tab strip included, in model units: its diagonal leaves the lens corner red. */
const GLASS_CORNERS: readonly [number, number][] = [
  [SCREEN.right, SCREEN.bottom],
  [SCREEN.right, SCREEN.top],
  [STRIP.diagonal + SCREEN.top - STRIP.bottom, SCREEN.top],
  [STRIP.diagonal, STRIP.bottom],
  [SCREEN.left, STRIP.bottom],
  [SCREEN.left, SCREEN.bottom],
];

/** Draws the closed polygon `points` with every corner rounded by `r` (a quadratic through the corner). */
function traceRounded(points: readonly [number, number][], r: number, pen: { move: (x: number, y: number) => void; line: (x: number, y: number) => void; quad: (cx: number, cy: number, x: number, y: number) => void }): void {
  const toward = ([x, y]: [number, number], [tx, ty]: [number, number]): [number, number] => {
    const len = Math.hypot(tx - x, ty - y);
    return [x + ((tx - x) * r) / len, y + ((ty - y) * r) / len];
  };
  points.forEach((p, i) => {
    const [ax, ay] = toward(p, points[(i + points.length - 1) % points.length]!);
    const [cx, cy] = toward(p, points[(i + 1) % points.length]!);
    if (i === 0) pen.move(ax, ay);
    else pen.line(ax, ay);
    pen.quad(p[0], p[1], cx, cy);
  });
}

/** A flat slab of `shape` from z to z + depth. */
function slab(shape: Shape, z: number, depth: number, bevel = 0): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, z);
  return g;
}

/** The glass's ordered dither, the same 4×4 Bayer and 4 levels as the HTML screen's #dex-dither filter (App.svelte). */
const DITHER_GLSL = /* glsl */ `
  if (uDither > 0.5) {
    vec2 p = mod(floor(gl_FragCoord.xy / uDitherCell), 4.0);
    vec2 lo = mod(p, 2.0), hi = floor(p / 2.0);
    // 2×2 Bayer [0 2; 3 1] at both scales: the same matrix the filter tiles.
    float k = 4.0 * (2.0 * lo.x + 3.0 * lo.y - 4.0 * lo.x * lo.y) + (2.0 * hi.x + 3.0 * hi.y - 4.0 * hi.x * hi.y);
    vec3 nudged = gl_FragColor.rgb + ((k + 0.5) / 16.0 - 0.5) / 4.0;
    gl_FragColor.rgb = clamp(floor(nudged * 4.0), 0.0, 3.0) / 3.0;
  }`;

/** `shell`: the body's colour (red; the shop totem's is blue). */
function buildModel(shell = 0xc8102e): { root: Group; dither: { uDither: { value: number }; uDitherCell: { value: number } }; dispose: () => void } {
  const root = new Group();
  /** On (1) or off (0), and the cell's size in device pixels. */
  const glassDither = { uDither: { value: 0 }, uDitherCell: { value: 2 } };
  // Lacquered shell and glass: a clear coat over each picks up the environment's reflections.
  const body = new MeshPhysicalMaterial({ color: shell, roughness: 0.42, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.12 });
  const black = new MeshPhysicalMaterial({ color: 0x141414, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.05 });
  const white = new MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3 });
  const blue = new MeshStandardMaterial({ color: 0x1557a8, roughness: 0.15, metalness: 0.2, emissive: 0x06224a });
  const ledRed = new MeshStandardMaterial({ color: 0xff3b3b, emissive: 0x801010 });
  const ledWhite = new MeshStandardMaterial({ color: 0xffffff, emissive: 0x404040 });
  // The screen's glass: the black lacquer, dithered (reflections included) when the setting is on.
  const glassMaterial = black.clone();
  glassMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, glassDither);
    shader.fragmentShader = `uniform float uDither;\nuniform float uDitherCell;\n${shader.fragmentShader.replace("#include <dithering_fragment>", `#include <dithering_fragment>\n${DITHER_GLSL}`)}`;
  };
  const materials = [body, black, glassMaterial, white, blue, ledRed, ledWhite];
  const geometries: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, material: MeshStandardMaterial, at?: [number, number, number]) => {
    geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    if (at) mesh.position.set(...at);
    root.add(mesh);
    return mesh;
  };

  add(slab(roundedRect(BODY.left, BODY.right, BODY.bottom, BODY.top, 0.35), -BODY.depth / 2, BODY.depth, BODY.bevel), body);
  // The screen under the HTML; its tab strip rises past a diagonal, leaving the lens corner red.
  const glass = new Shape();
  traceRounded(GLASS_CORNERS, GLASS_RADIUS, { move: (x, y) => glass.moveTo(x, y), line: (x, y) => glass.lineTo(x, y), quad: (cx, cy, x, y) => glass.quadraticCurveTo(cx, cy, x, y) });
  add(slab(glass, FRONT, 0.03), glassMaterial);
  // Lens: white ring and a glossy blue dome, top left.
  add(new CylinderGeometry(0.5, 0.5, 0.08, 40), white, [-3.9, 2.78, FRONT + 0.04]).rotation.x = Math.PI / 2;
  add(new SphereGeometry(0.4, 32, 16), blue, [-3.9, 2.78, FRONT + 0.08]).scale.z = 0.45;
  // Three small lights beside it, above the strip.
  [ledRed, ledWhite, black].forEach((m, i) => add(new SphereGeometry(0.09, 16, 8), m, [-2.9 + i * 0.3, 3.0, FRONT + 0.02]));

  return {
    root,
    dither: glassDither,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/**
 * Where the device sits. `full`: the settings screen's, alone in the middle (it rises in on mount).
 * Block H, the game's phone: `docked`, small and tilted in the bottom-right corner with only its top strip
 * showing; `raised`, up in the middle, whole, a little smaller than `full` so the world shows around it.
 */
export type DexPose = "full" | "docked" | "raised";

interface PoseParams {
  /** World units, from the centre of the view; scale of the body. */
  x: number;
  y: number;
  scale: number;
  tiltX: number;
  tiltZ: number;
  sway: number;
}

const POSE_MS = 420;
const RAISED_SCALE = 0.9;
const DOCKED_SCALE = 0.36;
/** How much of the docked body shows above the bottom edge: the lens, the lights and the tab strip. */
const DOCKED_SHOWN = BODY.top - STRIP.bottom + 0.3;

/** Mounts the Pokédex in `host` and keeps `screen` (DEX_SCREEN_W × DEX_SCREEN_H) on its screen; returns the teardown. */
export function createPokedex(host: HTMLElement, screen: HTMLElement): { setDither: (on: boolean) => void; dispose: () => void } {
  return mountPokedex(host, screen, "full");
}

/** The Pokédex in `host` with `screen` on it, in a pose that `setPose` moves it out of with an ease; `setDither` dithers its glass. */
export function mountPokedex(
  host: HTMLElement,
  screen: HTMLElement,
  initial: DexPose,
  button?: HTMLElement,
  shell?: number,
): { setPose: (pose: DexPose) => void; setDither: (on: boolean) => void; dispose: () => void } {
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
  const model = buildModel(shell);
  scene.add(model.root);

  let size = { w: 1, h: 1 };
  /** Half the view's height and width at the body's depth, in model units. */
  let view = { halfH: 1, halfW: 1 };
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
    view = { halfH: camera.position.z * half, halfW: camera.position.z * half * camera.aspect };
    // How much the projection scales the screen's CSS px at rest: the screen divides its font size by it, so
    // its text matches the other menus' (the entry and sway are left out, or the text would pulse). The
    // phone's text is sized for its raised pose, the only one where it is read.
    const width = ((SCREEN.right - SCREEN.left) * size.h) / (2 * half * (camera.position.z - FRONT - 0.03));
    const scale = (width * (initial === "full" ? 1 : RAISED_SCALE)) / DEX_SCREEN_W;
    screen.style.setProperty("--dex-scale", String(scale));
    // The HTML's dither cells are 2 screen px: the glass's match them on the page, in device pixels.
    model.dither.uDitherCell.value = Math.max(1, Math.round(2 * scale * renderer.getPixelRatio()));
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();

  // The glass's outline in screen px (diagonal and rounded corners), so the screen's filters stay off the red body.
  const px = (x: number) => (x - SCREEN.left) * 100;
  const py = (y: number) => (SCREEN.top - y) * 100;
  let outline = "";
  traceRounded(GLASS_CORNERS, GLASS_RADIUS, {
    move: (x, y) => (outline += `M ${px(x)} ${py(y)} `),
    line: (x, y) => (outline += `L ${px(x)} ${py(y)} `),
    quad: (cx, cy, x, y) => (outline += `Q ${px(cx)} ${py(cy)} ${px(x)} ${py(y)} `),
  });
  screen.style.clipPath = `path("${outline}Z")`;
  screen.style.position = "absolute";
  screen.style.left = "0";
  screen.style.top = "0";
  screen.style.transformOrigin = "0 0";
  const quad = (left: number, right: number, top: number, bottom: number) =>
    [new Vector3(left, top, FRONT + 0.03), new Vector3(right, top, FRONT + 0.03), new Vector3(right, bottom, FRONT + 0.03), new Vector3(left, bottom, FRONT + 0.03)] as const;
  const corners = quad(SCREEN.left, SCREEN.right, SCREEN.top, SCREEN.bottom);
  const buttonCorners = quad(MENU_BUTTON.x - MENU_BUTTON.half, MENU_BUTTON.x + MENU_BUTTON.half, MENU_BUTTON.y + MENU_BUTTON.half, MENU_BUTTON.y - MENU_BUTTON.half);
  if (button) Object.assign(button.style, { position: "absolute", left: "0", top: "0", transformOrigin: "0 0", width: `${DEX_BUTTON_PX}px`, height: `${DEX_BUTTON_PX}px` });
  const point = new Vector3();
  /** `el` (w × h CSS px) warped onto the projected model quad `at`. */
  const place = (el: HTMLElement, w: number, h: number, at: readonly Vector3[]) => {
    const [a, b, c, d] = at.map((corner): [number, number] => {
      point.copy(corner).applyMatrix4(model.root.matrixWorld).project(camera);
      return [((point.x + 1) / 2) * size.w, ((1 - point.y) / 2) * size.h];
    }) as [[number, number], [number, number], [number, number], [number, number]];
    el.style.transform = `matrix3d(${quadTransform(w, h, [a, b, c, d]).join(",")})`;
  };
  const centre = -(BODY.top + BODY.bottom) / 2;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();

  /** The pose's place, worked out from the view each frame (the window may have been resized). */
  const target = (pose: DexPose): PoseParams => {
    switch (pose) {
      case "full":
        return { x: 0, y: centre, scale: 1, tiltX: 0, tiltZ: 0, sway: 1 };
      case "raised":
        return { x: 0, y: centre * RAISED_SCALE, scale: RAISED_SCALE, tiltX: 0, tiltZ: 0, sway: 1 };
      case "docked": {
        const s = DOCKED_SCALE;
        const margin = 0.25;
        return { x: view.halfW - margin - BODY.right * s, y: -view.halfH + DOCKED_SHOWN * s - BODY.top * s, scale: s, tiltX: -0.12, tiltZ: 0.07, sway: 0 };
      }
    }
  };
  let pose = initial;
  /** The pose being left, frozen where it was when `setPose` was called. */
  let from: PoseParams | undefined;
  let since = start;
  let shown: PoseParams = target(initial);
  const mix = (a: PoseParams, b: PoseParams, k: number): PoseParams => ({
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    scale: a.scale + (b.scale - a.scale) * k,
    tiltX: a.tiltX + (b.tiltX - a.tiltX) * k,
    tiltZ: a.tiltZ + (b.tiltZ - a.tiltZ) * k,
    sway: a.sway + (b.sway - a.sway) * k,
  });

  renderer.setAnimationLoop((now: number) => {
    const s = (now - start) / 1000;
    // The settings screen rises and opens towards the player; the phone starts docked.
    const k = still || initial !== "full" ? 1 : Math.min(1, (now - start) / ENTRY_MS);
    const ease = 1 - (1 - k) ** 3;
    const to = target(pose);
    const m = from === undefined || still ? 1 : Math.min(1, (now - since) / POSE_MS);
    shown = from === undefined ? to : mix(from, to, 1 - (1 - m) ** 3);
    if (m >= 1) from = undefined;
    const sway = still ? 0 : shown.sway;
    model.root.scale.setScalar(shown.scale);
    model.root.position.set(shown.x, shown.y - (1 - ease) * 9, 0);
    model.root.rotation.set((1 - ease) * 0.6 + shown.tiltX + sway * 0.025 * Math.sin(s * 0.7), sway * 0.05 * Math.sin(s * 0.45), shown.tiltZ);
    model.root.updateMatrixWorld();
    place(screen, DEX_SCREEN_W, DEX_SCREEN_H, corners);
    if (button) place(button, DEX_BUTTON_PX, DEX_BUTTON_PX, buttonCorners);
    renderer.render(scene, camera);
  });

  return {
    setPose(next: DexPose) {
      if (next === pose) return;
      from = shown;
      since = performance.now();
      pose = next;
    },
    setDither(on: boolean) {
      model.dither.uDither.value = on ? 1 : 0;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      model.dispose();
      scene.environment?.dispose();
      room.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
