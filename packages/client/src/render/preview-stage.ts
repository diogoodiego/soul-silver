import { RING_SPOTS, RING_TILES, ringArea } from "@soulsilver/shared/game";
import { ANIMATION_FRAME_MS, MAP_TILE_PX } from "@soulsilver/shared/maps";
import { parseSpriteFile, type SpriteEmitter } from "@soulsilver/shared/sprites";
import { Camera, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, WebGLRenderer } from "three";
import { obliqueProjection } from "./camera";
import { pixelTexture } from "./game-renderer";
import { loadBitmap, loadMapMesh, spriteUrl } from "./map-assets";
import { buildMapObject, type MapObject } from "./map-scene";
import { createFlamethrower, FLAMETHROWER_MOVE } from "./flamethrower";
import { createParticles, effectsOf, type ParticleFrame } from "./particles";

// A small three.js view for menus (the dev arena's previews): the ring (item V.3) an indoor map builds and, on it,
// a move's battle particles played from the player's spot to the foe's, over and over.

/** The ring seen whole: its floor, and its walls rising above the top edge. */
const RING_PX = RING_TILES * MAP_TILE_PX;
const WALL_ROOM_PX = 2 * MAP_TILE_PX;
export const STAGE_W = RING_PX;
export const STAGE_H = RING_PX + WALL_ROOM_PX;
/** One move use: the cast, the trip and the hit, then a pause before the next. */
const LOOP_MS = 1800;
const HIT_AFTER_MS = 450;

const FROM = { ...RING_SPOTS.player, ground: 0 };
/** Where the move's user stands on the canvas, in fractions of its size (for a sprite drawn over it). */
export const USER_AT = { x: FROM.x / STAGE_W, y: (FROM.y + WALL_ROOM_PX) / STAGE_H };
const TO = { ...RING_SPOTS.side, ground: 0 };

let battleFx: Promise<{ effects: Map<string, SpriteEmitter[]>; frames: Map<string, ParticleFrame> }> | undefined;
/** The battle effects and their pages, loaded once for every stage. */
function loadBattleFx() {
  battleFx ??= (async () => {
    const file = "battle-fx.json";
    const raw: unknown = await fetch(spriteUrl(file)).then((r) => (r.ok ? r.json() : undefined), () => undefined);
    const parsed = raw === undefined ? undefined : parseSpriteFile("sprite-set", raw, file);
    const frames = new Map<string, ParticleFrame>();
    if (!parsed?.ok) return { effects: new Map<string, SpriteEmitter[]>(), frames };
    const pages = await Promise.all(parsed.data.pages.map(async (p) => {
      const bitmap = await loadBitmap(spriteUrl(p.file));
      return bitmap && pixelTexture(bitmap);
    }));
    for (const f of parsed.data.frames) {
      const page = pages[f.page];
      if (page) frames.set(f.name, { frame: f, page });
    }
    return { effects: effectsOf(parsed.data), frames };
  })();
  return battleFx;
}

export function createPreviewStage(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(STAGE_W, STAGE_H, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new Camera();
  camera.matrixAutoUpdate = false;
  camera.projectionMatrix.set(...(obliqueProjection(0, -WALL_ROOM_PX, { w: STAGE_W, h: STAGE_H }) as Parameters<typeof camera.projectionMatrix.set>));
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

  let frames = new Map<string, ParticleFrame>();
  let effects = new Map<string, SpriteEmitter[]>();
  void loadBattleFx().then((fx) => ({ effects, frames } = fx));
  const particles = createParticles(scene, (name) => frames.get(name));

  // The open field has no ring: plain ground in its place.
  const field = new Mesh(new PlaneGeometry(RING_PX, RING_PX), new MeshBasicMaterial({ color: 0x5f8f52 }));
  field.rotation.x = -Math.PI / 2;
  field.position.set(RING_PX / 2, 0, RING_PX / 2);
  scene.add(field);

  let map: MapObject | undefined;
  let ringToken = 0;
  let move: number | undefined;
  let castAt = 0;
  let hitAt: number | undefined;
  const phase = (at: "attacker" | "travel" | "target") => effects.get(`move/${move}`)?.filter((d) => (d.at ?? "attacker") === at);

  const flamethrower = createFlamethrower(scene);
  let frame = requestAnimationFrame(function draw(now) {
    if (move === FLAMETHROWER_MOVE && now >= castAt) {
      flamethrower.play(() => FROM, { x: TO.x - FROM.x, y: TO.y - FROM.y }, now);
      castAt = now + LOOP_MS;
    } else if (move !== undefined && effects.size > 0 && now >= castAt) {
      particles.play(phase("attacker"), () => FROM, now);
      particles.play(phase("travel"), () => FROM, now, undefined, false, () => TO);
      hitAt = now + HIT_AFTER_MS;
      castAt = now + LOOP_MS;
    }
    if (hitAt !== undefined && now >= hitAt) {
      particles.play(phase("target"), () => TO, now);
      hitAt = undefined;
    }
    particles.update(now);
    flamethrower.update(now);
    map?.animate(Math.floor(now / ANIMATION_FRAME_MS));
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  });

  return {
    /** The ring of indoor map `id`; undefined shows the open field's plain ground. */
    async showRing(id: number | undefined): Promise<void> {
      const token = ++ringToken;
      map?.root.removeFromParent();
      map?.dispose();
      map = undefined;
      field.visible = id === undefined;
      if (id === undefined) return;
      const mesh = await loadMapMesh(ringArea(String(id), 0));
      if (!mesh || token !== ringToken) return;
      map = buildMapObject(mesh);
      scene.add(map.root);
    },
    /** Plays move `id` in a loop; undefined stops it. */
    playMove(id: number | undefined): void {
      if (id === move) return;
      move = id;
      castAt = 0;
      hitAt = undefined;
      particles.dispose();
      flamethrower.stop();
    },
    dispose(): void {
      cancelAnimationFrame(frame);
      particles.dispose();
      flamethrower.dispose();
      map?.dispose();
      field.geometry.dispose();
      field.material.dispose();
      renderer.dispose();
    },
  };
}
