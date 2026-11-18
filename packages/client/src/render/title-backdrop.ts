import type { AppSettings } from "@soulsilver/shared";
import { Camera, ColorManagement, DirectionalLight, LinearSRGBColorSpace, Scene, WebGLRenderer } from "three";
import { ANIMATION_STEP_TICKS } from "@soulsilver/shared/maps";
import { settings } from "../settings";
import { fillView, OBLIQUE, obliqueProjection } from "./camera";
import { LIGHT_DEPTH, LIGHT_DISTANCE, MAX_SHADE, SHADOW_QUALITY, SUN_FROM } from "./game-renderer";
import { createClientWorld, loadMapMesh } from "./map-assets";
import { buildMapObject, SHADE, type MapObject } from "./map-scene";
import { createPost } from "./post";

// The title screen's backdrop: the camera drifts from New Bark Town west and north towards Violet City.

/** New Bark, Route 29, Cherrygrove, Route 30, Route 31, Violet: each one borders the next. */
const ROUTE = ["60", "33", "67", "34", "35", "73"];
/** World pixels per second. */
const SPEED = 32;
const TICKS_PER_S = 60;

export function createTitleBackdrop(host: HTMLElement): () => void {
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000);
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;left:0;top:0;image-rendering:pixelated";
  host.append(canvas);

  // The game's HD-2D effects and shadows (items V.1 and V.2), following the settings as they change.
  let visual: AppSettings["visual"] | undefined;
  let post: ReturnType<typeof createPost> | undefined;
  renderer.shadowMap.enabled = true;
  const light = new DirectionalLight();
  light.shadow.bias = -0.001;

  let screen = fillView(host.clientWidth, host.clientHeight);
  const fit = () => {
    screen = fillView(host.clientWidth, host.clientHeight);
    // With effects on, the canvas is screen-sized and post upscales the native frame into it.
    const s = post ? screen.scale : 1;
    renderer.setSize(screen.w * s, screen.h * s, false);
    post?.setSize(screen.w, screen.h, screen.scale);
    canvas.style.width = `${screen.w * screen.scale}px`;
    canvas.style.height = `${screen.h * screen.scale}px`;
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();

  const unsubscribe = settings.subscribe((s) => {
    if (s.visual.quality !== visual?.quality) {
      post?.dispose();
      post = s.visual.quality === "off" ? undefined : createPost(renderer, s.visual.quality);
      if (s.visual.quality !== "off") {
        const { size, radius } = SHADOW_QUALITY[s.visual.quality];
        light.shadow.mapSize.set(size, size);
        light.shadow.radius = radius;
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
      visual = s.visual;
      fit();
    }
    visual = s.visual;
  });

  const scene = new Scene();
  scene.add(light, light.target);
  const camera = new Camera();
  camera.matrixAutoUpdate = false;
  const objects: MapObject[] = [];
  /** Map centres along the route, in New Bark's pixel space; empty until the maps load. */
  let waypoints: { x: number; y: number }[] = [];
  let disposed = false;

  void (async () => {
    const world = createClientWorld(() => {});
    const offsets = new Map<string, { dx: number; dy: number }>([[ROUTE[0]!, { dx: 0, dy: 0 }]]);
    const centres: { x: number; y: number }[] = [];
    for (const [i, id] of ROUTE.entries()) {
      const map = await world.ensure(id);
      const at = offsets.get(id);
      if (!map || !at) break;
      centres.push({ x: at.dx + map.widthPx / 2, y: at.dy + map.heightPx / 2 });
      // Neighbors too, so the screen edges are never empty.
      for (const n of map.neighbors) if (!offsets.has(n.map)) offsets.set(n.map, { dx: at.dx + n.dx, dy: at.dy + n.dy });
      if (ROUTE[i + 1] && !map.neighbors.some((n) => n.map === ROUTE[i + 1])) break;
    }
    waypoints = centres;
    await Promise.all(
      [...offsets].map(async ([id, at]) => {
        const map = await world.ensure(id);
        const mesh = await loadMapMesh(id).catch(() => undefined);
        if (!mesh || disposed) return;
        const object = buildMapObject(mesh, map?.levels[0]);
        object.root.position.set(at.dx, 0, at.dy);
        scene.add(object.root);
        objects.push(object);
      }),
    );
  })();

  /** Point `distance` pixels along the route, looping back to New Bark at the end. */
  function along(distance: number): { x: number; y: number } {
    const legs = waypoints.slice(1).map((p, i) => Math.hypot(p.x - waypoints[i]!.x, p.y - waypoints[i]!.y));
    const total = legs.reduce((a, b) => a + b, 0);
    // shortcut: the loop jumps back to New Bark with no fade; add one if the cut looks harsh.
    let d = total > 0 ? distance % total : 0;
    for (const [i, leg] of legs.entries()) {
      if (d <= leg) {
        const a = waypoints[i]!;
        const b = waypoints[i + 1]!;
        return { x: a.x + ((b.x - a.x) * d) / leg, y: a.y + ((b.y - a.y) * d) / leg };
      }
      d -= leg;
    }
    return waypoints[0] ?? { x: 0, y: 0 };
  }

  const start = performance.now();
  let frame = requestAnimationFrame(function draw(now) {
    const seconds = (now - start) / 1000;
    const focus = along(seconds * SPEED);
    const left = Math.round(focus.x - screen.w / 2);
    const top = Math.round(focus.y - screen.h / 2);
    camera.projectionMatrix.set(...(obliqueProjection(left, top, screen) as Parameters<typeof camera.projectionMatrix.set>));
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const k = Math.floor((seconds * TICKS_PER_S) / ANIMATION_STEP_TICKS);
    for (const o of objects) o.animate(k);
    // Same sun as the game's outdoor maps, kept over the middle of the view.
    light.castShadow = SHADE.visible = post !== undefined && visual !== undefined && visual.shadows > 0;
    if (light.castShadow && visual) {
      SHADE.opacity = (visual.shadows / 100) * MAX_SHADE;
      light.target.position.set(focus.x, 0, focus.y);
      light.position.copy(SUN_FROM).multiplyScalar(LIGHT_DISTANCE).add(light.target.position);
      const reach = Math.max(screen.w, screen.h / OBLIQUE) * 0.75;
      const cam = light.shadow.camera;
      if (cam.right !== reach) {
        [cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far] = [-reach, reach, reach, -reach, LIGHT_DISTANCE - LIGHT_DEPTH, LIGHT_DISTANCE + LIGHT_DEPTH];
        cam.updateProjectionMatrix();
      }
    }
    if (post && visual) post.render(scene, camera, visual, 0.5, true, { daylight: 1, left, top, seconds });
    else renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    unsubscribe();
    observer.disconnect();
    post?.dispose();
    for (const o of objects) o.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
