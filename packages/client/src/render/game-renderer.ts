import { tileAt, WARP_TICKS, type Entity, type WorldMap } from "@soulsilver/shared/game";
import { ANIMATION_FRAME_MS, MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { parseSpriteFile, type SpriteFrame, type SpriteSetFile } from "@soulsilver/shared/sprites";
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  ColorManagement,
  DoubleSide,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoColorSpace,
  Scene,
  Texture,
  WebGLRenderer,
} from "three";
import { clampCamera, integerScale, OBLIQUE, obliqueProjection, VIEW_H, VIEW_W, type Bounds } from "./camera";
import { loadBitmap, loadMapMesh, spriteUrl, type ClientWorld, type MapMesh } from "./map-assets";
import { buildMapObject, groundAt, type MapObject } from "./map-scene";

// Draws the world (spec 011) in 3D: each map's mesh, extracted from the ROM, under the fixed oblique
// camera, and entities as standing sprites at their ground height, so the depth buffer decides what
// covers them. The current map, its neighbors and theirs are kept loaded so borders never show a gap.

const PLAYER_SET = "overworld-player.json";
const EFFECT_SET = "field-effect.json";
/** Pixels of the sprite bottom hidden in tall grass. */
const GRASS_COVER_PX = 8;
const WALK_FRAME_MS = 150;
const RUN_FRAME_MS = 90;
/**
 * Sprites are moved this far toward the camera (up and south, which keeps them on the same pixels)
 * so their feet win over the ground they stand on.
 */
const SPRITE_DEPTH_BIAS = 8;

const FACING: Record<Direction, string> = { north: "up", south: "down", east: "right", west: "left" };

interface MapVisual {
  mesh: MapMesh;
  object: MapObject;
}

interface Actor {
  sprite: Mesh<BufferGeometry, MeshBasicMaterial>;
  last: { x: number; y: number };
  moving: boolean;
  /** Tile it stood on last frame, "tx,ty": entering a tall grass tile plays the rustle there. */
  tile: string;
}

/** A field effect playing its steps once, from `start`. */
interface Effect {
  sprite: Mesh<BufferGeometry, MeshBasicMaterial>;
  start: number;
}

interface Frame {
  frame: SpriteFrame;
  page: Texture;
}

export interface DrawView {
  self: Entity | undefined;
  others: Entity[];
}

function pixelTexture(image: ImageBitmap): Texture {
  const texture = new Texture(image);
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** A standing quad: `rows` of the frame from its top, feet (the anchor) at the origin, 1:1 on screen. */
function setQuad(geometry: BufferGeometry, { frame, page }: Frame, rows: number): void {
  const image = page.image as ImageBitmap;
  const corners = [
    [0, 0],
    [frame.w, 0],
    [0, rows],
    [frame.w, rows],
  ] as const;
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(corners.flatMap(([c, r]) => [c - frame.anchor.x, (frame.anchor.y - r) / OBLIQUE, 0])), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(corners.flatMap(([c, r]) => [(frame.x + c) / image.width, (frame.y + r) / image.height])), 2));
}

function markerQuad(geometry: BufferGeometry): void {
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([-6, 16 / OBLIQUE, 0, 6, 16 / OBLIQUE, 0, -6, 0, 0, 6, 0, 0]), 3));
}

export function createGameRenderer(host: HTMLElement, world: ClientWorld, log: (message: string) => void) {
  // The ROM's colors as they are: textures, vertex colors and output with no color space conversion.
  ColorManagement.enabled = false;
  const renderer = new WebGLRenderer({ antialias: false });
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(VIEW_W, VIEW_H, false);
  renderer.setClearColor(0x000000);
  const canvas = renderer.domElement;
  canvas.style.position = "absolute";
  canvas.style.imageRendering = "pixelated";
  const fade = document.createElement("div");
  fade.style.position = "absolute";
  fade.style.background = "#000";
  fade.style.opacity = "0";
  fade.style.pointerEvents = "none";
  host.append(canvas, fade);

  const scene = new Scene();
  const camera = new Camera();
  camera.matrixAutoUpdate = false;

  // Window size -> whole-number scale with bars (FR-012).
  const fit = () => {
    const { scale, left, top } = integerScale(host.clientWidth, host.clientHeight);
    for (const element of [canvas, fade]) {
      element.style.width = `${VIEW_W * scale}px`;
      element.style.height = `${VIEW_H * scale}px`;
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    }
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();

  // Sprite frames: the player's and the field effects'.
  const frames = new Map<string, Frame>();
  const pages: Texture[] = [];
  async function loadSet(file: string): Promise<SpriteSetFile | undefined> {
    const raw = await fetch(spriteUrl(file)).then((r): Promise<unknown> | undefined => (r.ok ? r.json() : undefined), () => undefined);
    const parsed = raw === undefined ? undefined : parseSpriteFile("sprite-set", raw, file);
    if (!parsed?.ok) return undefined;
    const set: SpriteSetFile = parsed.data;
    const bitmaps = await Promise.all(set.pages.map((p) => loadBitmap(spriteUrl(p.file))));
    const own = bitmaps.map((b) => b && pixelTexture(b));
    for (const t of own) if (t) pages.push(t);
    for (const f of set.frames) {
      const page = own[f.page];
      if (page) frames.set(f.name, { frame: f, page });
    }
    return set;
  }
  void loadSet(PLAYER_SET).then((set) => {
    if (!set) log("Player sprites missing; drawing markers");
  });
  let rustle: { frame: string; ms: number }[] = [];
  void loadSet(EFFECT_SET).then((set) => {
    rustle = set?.sprites.find((s) => s.name === "field-effect/grass")?.animations[0]?.steps ?? [];
    if (rustle.length === 0) log("Field effect sprites missing; no grass rustle");
  });
  const spriteMaterials = new Map<Texture, MeshBasicMaterial>();
  const spriteMaterial = (page: Texture) => {
    let material = spriteMaterials.get(page);
    if (!material) {
      material = new MeshBasicMaterial({ map: page, alphaTest: 0.5, side: DoubleSide });
      spriteMaterials.set(page, material);
    }
    return material;
  };
  const markerMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });

  // Map streaming.
  const visuals = new Map<string, MapVisual | "loading">();
  let currentArea: string | undefined;
  /** Map id -> offset from the current map, for the maps wanted on screen. */
  let placement = new Map<string, { dx: number; dy: number }>();
  let bounds: Bounds = { left: 0, top: 0, right: VIEW_W, bottom: VIEW_H };

  async function loadVisual(map: WorldMap): Promise<MapVisual | undefined> {
    const mesh = await loadMapMesh(map.id).catch((error: unknown) => {
      log(`Map ${map.id} mesh: ${(error as Error).message}`);
      return undefined;
    });
    return mesh && { mesh, object: buildMapObject(mesh) };
  }

  function destroyVisual(visual: MapVisual): void {
    visual.object.root.removeFromParent();
    visual.object.dispose();
  }

  function place(id: string, visual: MapVisual): void {
    const at = placement.get(id);
    const root = visual.object.root;
    root.visible = at !== undefined;
    if (at) root.position.set(at.dx, 0, at.dy);
    if (!root.parent) scene.add(root);
  }

  function drop(id: string): void {
    const visual = visuals.get(id);
    if (visual && visual !== "loading") destroyVisual(visual);
    visuals.delete(id);
  }

  async function enterArea(area: string): Promise<void> {
    const current = await world.ensure(area);
    if (currentArea !== area) return;
    if (!current) {
      placement = new Map();
      bounds = { left: 0, top: 0, right: VIEW_W, bottom: VIEW_H };
      return;
    }
    // Warp destinations too (data only), so prediction arrives where the server does.
    for (const w of current.warps) void world.ensure(w.destMap);
    // Two hops: direct neighbors plus theirs, so diagonal corners are drawn too.
    const next = new Map<string, { dx: number; dy: number }>([[area, { dx: 0, dy: 0 }]]);
    const direct = await Promise.all(current.neighbors.map(async (n) => ({ n, map: await world.ensure(n.map) })));
    bounds = { left: 0, top: 0, right: current.widthPx, bottom: current.heightPx };
    for (const { n, map } of direct) {
      if (!map) continue;
      next.set(map.id, { dx: n.dx, dy: n.dy });
      bounds = {
        left: Math.min(bounds.left, n.dx),
        top: Math.min(bounds.top, n.dy),
        right: Math.max(bounds.right, n.dx + map.widthPx),
        bottom: Math.max(bounds.bottom, n.dy + map.heightPx),
      };
      const second = await Promise.all(map.neighbors.map(async (m) => ({ m, map: await world.ensure(m.map) })));
      for (const { m, map: far } of second) if (far && !next.has(far.id)) next.set(far.id, { dx: n.dx + m.dx, dy: n.dy + m.dy });
    }
    if (currentArea !== area) return;
    placement = next;
    for (const id of [...visuals.keys()]) if (!next.has(id)) drop(id);
    for (const id of next.keys()) {
      const existing = visuals.get(id);
      if (existing && existing !== "loading") place(id, existing);
      if (existing) continue;
      visuals.set(id, "loading");
      void loadVisual(world.lookup(id)!).then((visual) => {
        if (!visual) return;
        if (visuals.get(id) !== "loading") {
          destroyVisual(visual);
          return;
        }
        visuals.set(id, visual);
        place(id, visual);
      });
    }
  }

  /** Ground height under an entity of the current map; 0 until its mesh has loaded. */
  function groundOf(e: Entity): number {
    const visual = visuals.get(e.area);
    return visual && visual !== "loading" ? groundAt(visual.mesh.file, e.level, e.x, e.y) : 0;
  }

  // Entities.
  const actors = new Map<number, Actor>();
  const effects: Effect[] = [];

  /** Starts the grass rustle on tile (tx, ty), in front of whoever stands in it. */
  function rustleAt(tx: number, ty: number, ground: number, now: number): void {
    if (rustle.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    const sprite = new Mesh(geometry, markerMaterial);
    sprite.frustumCulled = false;
    sprite.visible = false;
    // Its foot on the tile's south edge: nearer the camera than an actor in the tile, so it covers the feet.
    sprite.position.set(tx * MAP_TILE_PX + MAP_TILE_PX / 2, ground + SPRITE_DEPTH_BIAS, (ty + 1) * MAP_TILE_PX + SPRITE_DEPTH_BIAS * OBLIQUE);
    scene.add(sprite);
    effects.push({ sprite, start: now });
  }

  function drawEffects(now: number): void {
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i]!;
      let elapsed = now - effect.start;
      const step = rustle.find((s) => (elapsed -= s.ms) < 0);
      const frame = step && frames.get(step.frame);
      if (!frame) {
        effect.sprite.removeFromParent();
        effect.sprite.geometry.dispose();
        effects.splice(i, 1);
        continue;
      }
      setQuad(effect.sprite.geometry, frame, frame.frame.h);
      effect.sprite.material = spriteMaterial(frame.page);
      effect.sprite.visible = true;
    }
  }

  function frameFor(e: Entity, moving: boolean, running: boolean, now: number) {
    const gait = running ? "run" : "walk";
    const step = moving ? Math.floor(now / (running ? RUN_FRAME_MS : WALK_FRAME_MS)) % 4 : 0;
    const variant = e.data["character"] === "female" ? 1 : 0;
    return frames.get(`overworld-player/${variant}/${gait}/${FACING[e.facing]}/${step}`);
  }

  function drawEntity(e: Entity, running: boolean, now: number): void {
    let actor = actors.get(e.id);
    if (!actor) {
      const geometry = new BufferGeometry();
      geometry.setIndex([0, 2, 1, 1, 2, 3]);
      actor = { sprite: new Mesh(geometry, markerMaterial), last: { x: e.x, y: e.y }, moving: false, tile: "" };
      actor.sprite.frustumCulled = false;
      scene.add(actor.sprite);
      actors.set(e.id, actor);
    }
    actor.moving = Math.hypot(e.x - actor.last.x, e.y - actor.last.y) > 0.01 || e.data["hop"] !== undefined;
    actor.last = { x: e.x, y: e.y };
    const frame = frameFor(e, actor.moving, running, now);
    const inGrass = tileAt(world.lookup, e.area, e.level, e.x, e.y)?.category === "tallGrass";
    const [tx, ty] = [Math.floor(e.x / MAP_TILE_PX), Math.floor(e.y / MAP_TILE_PX)];
    if (actor.tile !== `${tx},${ty}`) {
      if (actor.tile !== "" && inGrass) rustleAt(tx, ty, groundOf(e), now);
      actor.tile = `${tx},${ty}`;
    }
    if (frame) {
      setQuad(actor.sprite.geometry, frame, inGrass ? Math.max(1, frame.frame.h - GRASS_COVER_PX) : frame.frame.h);
      actor.sprite.material = spriteMaterial(frame.page);
    } else {
      markerQuad(actor.sprite.geometry);
      actor.sprite.material = markerMaterial;
    }
    const y = groundOf(e) + SPRITE_DEPTH_BIAS;
    actor.sprite.position.set(Math.round(e.x), y, Math.round(e.y) + SPRITE_DEPTH_BIAS * OBLIQUE);
  }

  return {
    /** Once per animation frame. `running` is the local player's run button. */
    draw(view: DrawView, running: boolean, now: number): void {
      const self = view.self;
      if (!self) return;
      if (self.area !== currentArea) {
        // Rebase what is already placed onto the new map at once, so nothing is drawn at stale offsets while enterArea loads.
        const origin = placement.get(self.area);
        if (origin) {
          placement = new Map([...placement].map(([id, at]) => [id, { dx: at.dx - origin.dx, dy: at.dy - origin.dy }]));
          bounds = { left: bounds.left - origin.dx, top: bounds.top - origin.dy, right: bounds.right - origin.dx, bottom: bounds.bottom - origin.dy };
          for (const [id, visual] of visuals) if (visual !== "loading") place(id, visual);
        }
        currentArea = self.area;
        void enterArea(self.area);
      }
      const seen = new Set<number>();
      for (const e of [self, ...view.others]) {
        if (e.kind !== "player" || e.area !== self.area) continue;
        seen.add(e.id);
        drawEntity(e, e.id === self.id && running, now);
      }
      for (const [id, actor] of actors) {
        if (seen.has(id)) continue;
        actor.sprite.removeFromParent();
        actor.sprite.geometry.dispose();
        actors.delete(id);
      }
      drawEffects(now);
      const mapFrame = Math.floor(now / ANIMATION_FRAME_MS);
      for (const visual of visuals.values()) if (visual !== "loading") visual.object.animate(mapFrame);
      // The view follows the player's feet as drawn: raised ground draws higher.
      const view2d = clampCamera(self.x, self.y - OBLIQUE * groundOf(self), bounds);
      camera.projectionMatrix.set(...(obliqueProjection(view2d.x, view2d.y) as Parameters<typeof camera.projectionMatrix.set>));
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      renderer.render(scene, camera);
      // Black at the map swap, half way through the warp (data-model.md).
      const warping = typeof self.data["warping"] === "number" ? self.data["warping"] : 0;
      fade.style.opacity = String(warping > 0 ? 1 - Math.abs(warping - WARP_TICKS / 2) / (WARP_TICKS / 2) : 0);
    },
    destroy(): void {
      observer.disconnect();
      for (const id of [...visuals.keys()]) drop(id);
      for (const actor of actors.values()) actor.sprite.geometry.dispose();
      for (const effect of effects) effect.sprite.geometry.dispose();
      for (const m of spriteMaterials.values()) m.dispose();
      for (const p of pages) p?.dispose();
      markerMaterial.dispose();
      renderer.dispose();
      canvas.remove();
      fade.remove();
    },
  };
}

export type GameRenderer = ReturnType<typeof createGameRenderer>;
