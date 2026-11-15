import { HOP_TICKS, tileAt, WARP_TICKS, type Entity, type HitEvent, type WorldMap } from "@soulsilver/shared/game";
import { ANIMATION_FRAME_MS, MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { parseSpriteFile, type SpriteEmitter, type SpriteFrame, type SpriteSetFile } from "@soulsilver/shared/sprites";
import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  ColorManagement,
  CircleGeometry,
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
import { clampCamera, fillView, OBLIQUE, obliqueProjection, VIEW_H, VIEW_W, type Bounds } from "./camera";
import { loadBitmap, loadMapMesh, loadPropMesh, spriteUrl, type ClientWorld, type MapMesh } from "./map-assets";
import { CLEARING_RADIUS_PX, clearings } from "./grass-clearing";
import { buildMapObject, groundAt, setGrassClearings, type MapObject } from "./map-scene";
import { createParticles, effectsOf } from "./particles";

// Draws the world (spec 011) in 3D: each map's mesh, extracted from the ROM, under the fixed oblique
// camera, and entities as standing sprites at their ground height, so the depth buffer decides what
// covers them. The current map, its neighbors and theirs are kept loaded so borders never show a gap.

const PLAYER_SET = "overworld-player.json";
/** Server spawn.json shakeSeconds (spec 015). shortcut: fixed here; send it in the capture message if it is ever tuned. */
export const SHAKE_MS = 800;
const POKEMON_SET = "overworld-pokemon.json";
const NPC_SET = "overworld-npc.json";
/** Kinds drawn in the world; projectiles and fields (spec 013) are markers. */
const DRAWN = new Set(["player", "pokemon", "projectile", "npc"]);
/** A hit target blinks at this period while its flash lasts. */
const FLASH_MS = 60;
const EFFECT_SET = "field-effect.json";
const BATTLE_FX_SET = "battle-fx.json";
/** Pixels of the sprite bottom hidden in tall grass. */
const GRASS_COVER_PX = 8;
/** Sight in a dark cave without Flash: radius around the player's eyes, in game pixels. */
const DARK_RADIUS_PX = 36;
const DARK_EYE_PX = 12;
const WALK_FRAME_MS = 150;
const RUN_FRAME_MS = 90;
/** Overworld Pokémon have 2 walk frames per step: a faster swap keeps pace with the trainer's 4. */
const POKEMON_FRAME_MS = 100;
/** Standing Pokémon bounce in place: up IDLE_BOUNCE_PX for half of each IDLE_BOUNCE_MS. */
const IDLE_BOUNCE_MS = 500;
const IDLE_BOUNCE_PX = 2;
/** Peak height of a ledge hop arc. */
const HOP_ARC_PX = 12;
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
  /** Where a cutscene points the camera (spec 021); the player's feet otherwise. */
  focus?: { x: number; y: number } | undefined;
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

function markerQuad(geometry: BufferGeometry, half = 6, height = 16): void {
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([-half, height / OBLIQUE, 0, half, height / OBLIQUE, 0, -half, 0, 0, half, 0, 0]), 3));
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
  // A dark cave without Flash (spec 025, FR-016): black but for a circle around the player.
  const gloom = document.createElement("div");
  gloom.style.position = "absolute";
  gloom.style.pointerEvents = "none";
  let dark = false;
  // The day tint of outdoor maps (spec 026): the colour multiplies the scene under it; below the gloom.
  const tint = document.createElement("div");
  tint.style.position = "absolute";
  tint.style.pointerEvents = "none";
  tint.style.mixBlendMode = "multiply";
  host.append(canvas, tint, fade, gloom);

  const scene = new Scene();
  const camera = new Camera();
  camera.matrixAutoUpdate = false;

  // Host size -> whole-number scale, and a view as large as the host at that scale: no bars (FR-012).
  let screen = fillView(VIEW_W, VIEW_H);
  let viewTopLeft = { x: 0, y: 0 };
  /** The map and level drawn last: projected points stand on its ground, as the camera does. */
  let viewOf: { area: string; level: number } | undefined;
  const fit = () => {
    screen = fillView(host.clientWidth, host.clientHeight);
    renderer.setSize(screen.w, screen.h, false);
    for (const element of [canvas, tint, fade, gloom]) {
      element.style.width = `${screen.w * screen.scale}px`;
      element.style.height = `${screen.h * screen.scale}px`;
      element.style.left = "0";
      element.style.top = "0";
    }
  };
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();

  // Sprite frames: the player's and the field effects'.
  const frames = new Map<string, Frame>();
  const pages: Texture[] = [];
  const shinyOf = new Map<Texture, Texture>();
  /** Wild Pokémon inside a ball (spec 015): drawn as the ball, wobbling once per shake. */
  const inBall = new Map<number, { start: number; shakes: number }>();
  /** Shiny wild Pokémon already greeted with the sparkle. */
  const sparkled = new Set<number>();
  async function loadSet(file: string): Promise<SpriteSetFile | undefined> {
    const raw = await fetch(spriteUrl(file)).then((r): Promise<unknown> | undefined => (r.ok ? r.json() : undefined), () => undefined);
    const parsed = raw === undefined ? undefined : parseSpriteFile("sprite-set", raw, file);
    if (!parsed?.ok) return undefined;
    const set: SpriteSetFile = parsed.data;
    const bitmaps = await Promise.all(set.pages.map((p) => loadBitmap(spriteUrl(p.file))));
    const own = bitmaps.map((b) => b && pixelTexture(b));
    for (const t of own) if (t) pages.push(t);
    // Shiny palette pages (spec 015): same layout, other colours.
    await Promise.all(
      set.pages.map(async (p, i) => {
        const bitmap = p.shinyFile && own[i] ? await loadBitmap(spriteUrl(p.shinyFile)) : undefined;
        if (!bitmap) return;
        const texture = pixelTexture(bitmap);
        pages.push(texture);
        shinyOf.set(own[i]!, texture);
      }),
    );
    for (const f of set.frames) {
      const page = own[f.page];
      if (page) frames.set(f.name, { frame: f, page });
    }
    return set;
  }
  void loadSet(PLAYER_SET).then((set) => {
    if (!set) log("Player sprites missing; drawing markers");
    indexGfx(set);
  });
  /** Map-event sprite id -> the overworld sheet it is drawn with (spec 021); filled from the sets' gfx lists. */
  const sheetOfGfx = new Map<number, string>();
  const indexGfx = (set: SpriteSetFile | undefined) => {
    for (const s of set?.sprites ?? []) for (const g of s.gfx ?? []) sheetOfGfx.set(g, s.name);
  };
  void loadSet(POKEMON_SET).then((set) => {
    if (!set) log("Pokémon sprites missing; drawing markers");
    indexGfx(set);
  });
  void loadSet(NPC_SET).then((set) => {
    if (!set) log("NPC sprites missing; drawing markers");
    indexGfx(set);
  });
  let rustle: { frame: string; ms: number }[] = [];
  void loadSet(EFFECT_SET).then((set) => {
    rustle = set?.sprites.find((s) => s.name === "field-effect/grass")?.animations[0]?.steps ?? [];
    if (rustle.length === 0) log("Field effect sprites missing; no grass rustle");
  });
  let battleFx = new Map<string, SpriteEmitter[]>();
  void loadSet(BATTLE_FX_SET).then((set) => {
    if (set) battleFx = effectsOf(set);
    else log("Battle effect sprites missing; moves and statuses draw no particles");
  });
  const particles = createParticles(scene, (name) => frames.get(name));
  /** Entities drawn last frame, so effects can follow them. */
  let latest = new Map<number, Entity>();
  /** Grass clearings this frame (fights), where sprites show their feet. */
  let cleared: { x: number; y: number }[] = [];
  const anchorOf = (id: number) => () => {
    const e = latest.get(id);
    return e && { x: e.x, y: e.y, ground: groundOf(e) };
  };

  /** A move's emitters placed `at` (the script's placement); old extractions without one count as the user's. */
  const emittersAt = (move: number, at: NonNullable<SpriteEmitter["at"]>) => battleFx.get(`move/${move}`)?.filter((d) => (d.at ?? "attacker") === at);
  /** Last `used` counter seen per Pokémon: a change means it just used a move. */
  const usedSeen = new Map<number, number>();
  /** Moves with no particles in the ROM blink their user instead, until this time. */
  const blinkUntil = new Map<number, number>();
  /** Where a travelling effect of `user` aimed along (dx, dy) ends: the nearest Pokémon ahead, else a short way off. */
  const SHORT_TRAVEL_PX = 96;
  function travelEnd(user: Entity, dx: number, dy: number): () => { x: number; y: number; ground: number } | undefined {
    let best: Entity | undefined;
    for (const t of latest.values()) {
      const [tx, ty] = [t.x - user.x, t.y - user.y];
      if (t.kind !== "pokemon" || t.id === user.id || tx * dx + ty * dy <= 0) continue;
      if (!best || Math.hypot(tx, ty) < Math.hypot(best.x - user.x, best.y - user.y)) best = t;
    }
    if (best) return anchorOf(best.id);
    const end = { x: user.x + dx * SHORT_TRAVEL_PX, y: user.y + dy * SHORT_TRAVEL_PX, ground: groundOf(user) };
    return () => end;
  }

  /** Melee reach: the hit's arc, flat on the ground in front of the user, fading out. */
  const REACH_MS = 400;
  const REACH_OPACITY = 0.5;
  const reaches: Array<{ mesh: Mesh<CircleGeometry, MeshBasicMaterial>; start: number }> = [];
  function showReach(e: Entity, now: number): void {
    const radius = Number(e.data["usedReach"]);
    const angle = (Number(e.data["usedArc"]) * Math.PI) / 180;
    if (!(radius > 0 && angle > 0)) return;
    // Laid flat (local +y becomes world -z), so a world direction (dx, dy) is the local angle atan2(-dy, dx).
    const facing = Math.atan2(-Number(e.data["usedDy"]), Number(e.data["usedDx"]));
    const mesh = new Mesh(new CircleGeometry(radius, 24, facing - angle / 2, angle), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: REACH_OPACITY, depthWrite: false, side: DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(e.x, groundOf(e) + 0.5, e.y);
    mesh.frustumCulled = false;
    scene.add(mesh);
    reaches.push({ mesh, start: now });
  }
  function drawReaches(now: number): void {
    for (let i = reaches.length - 1; i >= 0; i--) {
      const r = reaches[i]!;
      const k = (now - r.start) / REACH_MS;
      if (k < 1) {
        r.mesh.material.opacity = REACH_OPACITY * (1 - k);
        continue;
      }
      r.mesh.removeFromParent();
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      reaches.splice(i, 1);
    }
  }

  function onMoveUsed(e: Entity, now: number): void {
    showReach(e, now);
    const move = Number(e.data["usedMove"]);
    if (!battleFx.has(`move/${move}`)) {
      blinkUntil.set(e.id, now + 400);
      return;
    }
    particles.play(emittersAt(move, "attacker"), anchorOf(e.id), now);
    // A projectile entity carries the travelling emitters itself (drawParticles).
    const flying = [...latest.values()].some((p) => p.kind === "projectile" && p.data["caster"] === e.id && p.data["move"] === move);
    const len = Math.hypot(Number(e.data["usedDx"]), Number(e.data["usedDy"])) || 1;
    if (!flying) particles.play(emittersAt(move, "travel"), anchorOf(e.id), now, undefined, false, travelEnd(e, Number(e.data["usedDx"]) / len, Number(e.data["usedDy"]) / len));
  }

  /** Starts, follows and stops the particles of move uses, projectiles and statuses. */
  function drawParticles(now: number): void {
    const wanted = new Set<string>();
    for (const e of latest.values()) {
      if (e.kind === "pokemon" && typeof e.data["used"] === "number") {
        const seen = usedSeen.get(e.id);
        usedSeen.set(e.id, e.data["used"]);
        if (seen !== undefined && seen !== e.data["used"]) onMoveUsed(e, now);
      }
      const effects: Array<[string, SpriteEmitter[] | undefined]> = [];
      if (e.kind === "projectile" && typeof e.data["move"] === "number") effects.push([`move/${e.data["move"]}`, emittersAt(e.data["move"], "travel")]);
      if (e.kind === "pokemon" && typeof e.data["status"] === "string" && e.data["status"] !== "") effects.push([`status/${e.data["status"]}`, battleFx.get(`status/${e.data["status"]}`)]);
      if (e.kind === "pokemon" && e.data["confused"] === true) effects.push(["status/confusion", battleFx.get("status/confusion")]);
      for (const [effect, defs] of effects) {
        const key = `${e.id}/${effect}`;
        wanted.add(key);
        particles.play(defs, anchorOf(e.id), now, key, true);
      }
    }
    for (const key of [...particles.keys()]) if (!key.startsWith("once/") && !wanted.has(key)) particles.stop(key);
    particles.update(now);
  }

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

  // Script props (spec 024): models placed by the map's scripts, cleared when the player changes map.
  const propMeshes = new Map<string, Promise<MapMesh | undefined>>();
  let props: { area: string; models: string; objects: (ReturnType<typeof buildMapObject> | undefined)[] } | undefined;
  let propsVersion = 0;
  function clearProps(): void {
    for (const o of props?.objects ?? []) {
      o?.root.removeFromParent();
      o?.dispose();
    }
    props = undefined;
  }

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
    return mesh && { mesh, object: buildMapObject(mesh, map.levels[0]) };
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
    if (e.kind === "projectile") return undefined;
    if (e.kind === "npc") {
      // Objects (rocks, trees, item balls) are one still frame; an id with no sheet stays a marker.
      const sheet = sheetOfGfx.get(Number(e.data["sprite"]));
      if (sheet === undefined) return undefined;
      const pokemon = sheet.startsWith("overworld-pokemon/");
      const step = moving ? Math.floor(now / (pokemon ? POKEMON_FRAME_MS : WALK_FRAME_MS)) % (pokemon ? 2 : 4) : 0;
      return frames.get(`${sheet}/walk/${FACING[e.facing]}/${step}`) ?? frames.get(`${sheet}/still/0`);
    }
    if (e.kind === "pokemon") {
      const step = moving ? Math.floor(now / POKEMON_FRAME_MS) % 2 : 0;
      const base = `overworld-pokemon/${String(e.data["species"])}/0`;
      const dir = FACING[e.facing];
      return frames.get(`${base}/unisex/walk/${dir}/${step}`) ?? frames.get(`${base}/male/walk/${dir}/${step}`);
    }
    // shortcut: a surfer rides still on the walk frame, bobbing (drawEntity); use the ROM's surf pose and mount once they are extracted.
    // shortcut: an angler stands on the walk frame, the "…" and "!" over it are the whole cast (GameSession); draw the ROM's fishing pose and line once extracted.
    // shortcut: a cyclist pedals on the run frames, the extracted set has no bicycle; swap them in once it does.
    const surfing = e.data["mode"] === "surf";
    const fast = running || e.data["mode"] === "bike";
    const gait = fast && !surfing ? "run" : "walk";
    const step = moving && !surfing ? Math.floor(now / (fast ? RUN_FRAME_MS : WALK_FRAME_MS)) % 4 : 0;
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
    const ball = inBall.get(e.id);
    if (ball && now >= ball.start + (ball.shakes + 1) * SHAKE_MS) inBall.delete(e.id);
    const frame = inBall.has(e.id) ? undefined : frameFor(e, actor.moving, running, now);
    const inGrass = tileAt(world.lookup, e.area, e.level, e.x, e.y)?.category === "tallGrass" && !cleared.some((c) => Math.hypot(c.x - e.x, c.y - e.y) <= CLEARING_RADIUS_PX);
    const [tx, ty] = [Math.floor(e.x / MAP_TILE_PX), Math.floor(e.y / MAP_TILE_PX)];
    if (actor.tile !== `${tx},${ty}`) {
      if (actor.tile !== "" && inGrass) rustleAt(tx, ty, groundOf(e), now);
      actor.tile = `${tx},${ty}`;
    }
    if (frame) {
      setQuad(actor.sprite.geometry, frame, inGrass ? Math.max(1, frame.frame.h - GRASS_COVER_PX) : frame.frame.h);
      const shiny = e.data["shiny"] === true;
      actor.sprite.material = spriteMaterial((shiny && shinyOf.get(frame.page)) || frame.page);
      // A shiny glints when it first comes into view.
      // shortcut: a blink stands in for the sparkle; use the ROM's shiny sparkle animation once it is extracted.
      if (shiny && !sparkled.has(e.id)) {
        sparkled.add(e.id);
        blinkUntil.set(e.id, now + 1200);
      }
    } else {
      if (inBall.has(e.id)) markerQuad(actor.sprite.geometry, 3, 6);
      else if (e.kind === "projectile") markerQuad(actor.sprite.geometry, e.data["field"] === true ? 12 : 3, e.data["field"] === true ? 2 : 6);
      else markerQuad(actor.sprite.geometry);
      actor.sprite.material = markerMaterial;
    }
    const particlesOnly = e.kind === "projectile" && battleFx.has(`move/${String(e.data["move"])}`);
    const blinking = e.data["flash"] === true || (blinkUntil.get(e.id) ?? 0) > now;
    actor.sprite.visible = !particlesOnly && (!blinking || Math.floor(now / FLASH_MS) % 2 === 0);
    const bounce = ((e.kind === "pokemon" && !actor.moving) || e.data["mode"] === "surf") && Math.floor(now / (IDLE_BOUNCE_MS / 2)) % 2 === 0 ? IDLE_BOUNCE_PX : 0;
    const hop = e.data["hop"];
    // shortcut: the arc steps once per server tick (the counter is not interpolated); smooth it if it reads choppy.
    const lift = typeof hop === "number" ? Math.round(Math.sin((Math.PI * (HOP_TICKS - hop + 0.5)) / HOP_TICKS) * HOP_ARC_PX) : 0;
    const y = groundOf(e) + SPRITE_DEPTH_BIAS + bounce + lift;
    // A hit target shakes sideways while its flash lasts.
    // A ball rocks during the first half of each shake window, then rests.
    const rocking = ball && inBall.has(e.id) && now - ball.start < ball.shakes * SHAKE_MS && (now - ball.start) % SHAKE_MS < SHAKE_MS / 2;
    const shake = e.data["flash"] === true ? Math.round(Math.sin(now / 15) * 2) : rocking ? Math.round(Math.sin(now / 40) * 3) : 0;
    actor.sprite.position.set(Math.round(e.x) + shake, y, Math.round(e.y) + SPRITE_DEPTH_BIAS * OBLIQUE);
  }

  return {
    /** Replaces the props on `area`; positions in the map's pixels, height included. */
    setProps(area: string, list: readonly { model: number; x: number; y: number; z: number; pose?: number }[]): void {
      const models = list.map((p) => `${p.model}-${p.pose ?? ""}`).join(",");
      // Spec 030.5: the same props moved (a Spinarak cart gliding, every tick) are only placed again.
      if (props?.area === area && props.models === models && list.every((_, i) => props!.objects[i])) {
        list.forEach((p, i) => props!.objects[i]!.root.position.set(p.x, p.y, p.z));
        return;
      }
      clearProps();
      const version = ++propsVersion;
      props = { area, models, objects: [] };
      list.forEach((p, i) => {
        const key = p.pose === undefined ? String(p.model) : `${p.model}-${p.pose}`;
        let mesh = propMeshes.get(key);
        if (!mesh) {
          mesh = loadPropMesh(p.model, p.pose).catch((error: unknown) => {
            log(`Prop ${key} mesh: ${(error as Error).message}`);
            return undefined;
          });
          propMeshes.set(key, mesh);
        }
        void mesh.then((m) => {
          if (!m || version !== propsVersion || !props) return;
          const object = buildMapObject(m);
          // shortcut: map units are pixels indoors only; outdoor props need the matrix origin taken off when one appears.
          object.root.position.set(p.x, p.y, p.z);
          object.root.visible = area === currentArea;
          scene.add(object.root);
          // In list order, whichever mesh loads first: a later move places each by its index.
          props.objects[i] = object;
        });
      });
    },
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
        if (props && props.area !== self.area) clearProps();
        for (const o of props?.objects ?? []) if (o) o.root.visible = true;
        void enterArea(self.area);
      }
      const seen = new Set<number>();
      latest = new Map();
      for (const seenAs of [self, ...view.others]) {
        // Entities on a neighbor map are drawn shifted into this map's space, so a companion a few frames behind across a border does not blink.
        const at = seenAs.area === self.area ? { dx: 0, dy: 0 } : placement.get(seenAs.area);
        if (!DRAWN.has(seenAs.kind) || !at) continue;
        const e = at.dx === 0 && at.dy === 0 ? seenAs : { ...seenAs, area: self.area, x: seenAs.x + at.dx, y: seenAs.y + at.dy };
        seen.add(e.id);
        latest.set(e.id, e);
      }
      cleared = clearings([...latest.values()]);
      setGrassClearings(cleared);
      for (const e of latest.values()) drawEntity(e, e.id === self.id && running, now);
      for (const [id, actor] of actors) {
        if (seen.has(id)) continue;
        actor.sprite.removeFromParent();
        actor.sprite.geometry.dispose();
        actors.delete(id);
      }
      drawEffects(now);
      drawParticles(now);
      drawReaches(now);
      const mapFrame = Math.floor(now / ANIMATION_FRAME_MS);
      for (const visual of visuals.values()) if (visual !== "loading") visual.object.animate(mapFrame);
      // The view follows the player's feet as drawn: raised ground draws higher.
      const view2d = view.focus ? clampCamera(view.focus.x, view.focus.y - OBLIQUE * groundOf(self), bounds, screen) : clampCamera(self.x, self.y - OBLIQUE * groundOf(self), bounds, screen);
      viewTopLeft = view2d;
      viewOf = { area: self.area, level: self.level };
      camera.projectionMatrix.set(...(obliqueProjection(view2d.x, view2d.y, screen) as Parameters<typeof camera.projectionMatrix.set>));
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      renderer.render(scene, camera);
      // Black at the map swap, half way through the warp (data-model.md).
      const warping = typeof self.data["warping"] === "number" ? self.data["warping"] : 0;
      fade.style.opacity = String(warping > 0 ? 1 - Math.abs(warping - WARP_TICKS / 2) / (WARP_TICKS / 2) : 0);
      const eye = { x: (self.x - view2d.x) * screen.scale, y: (self.y - OBLIQUE * groundOf(self) - DARK_EYE_PX - view2d.y) * screen.scale };
      gloom.style.background = dark ? `radial-gradient(circle at ${eye.x}px ${eye.y}px, transparent ${DARK_RADIUS_PX * screen.scale}px, #000 ${DARK_RADIUS_PX * 1.4 * screen.scale}px)` : "none";
    },
    /** Plays the move's ROM particles on each hit target. */
    /** A ball caught this wild Pokémon: show the ball and its shakes in its place. */
    capture(wildId: number, shakes: number, now: number): void {
      inBall.set(wildId, { start: now, shakes });
    },
    combatEvents(events: readonly HitEvent[], now: number): void {
      // Damage, statuses and stat changes on a foe: the emitters the script places on the target.
      for (const e of events) if (e.move > 0 && e.target !== e.attacker && e.kind !== "failed") particles.play(emittersAt(e.move, "target"), anchorOf(e.target), now);
    },
    /** The day tint over the map (spec 026), channels 0–1; null for none (indoors and caves). */
    setTint(rgb: { r: number; g: number; b: number } | null): void {
      const css = rgb ? `rgb(${[rgb.r, rgb.g, rgb.b].map((c) => Math.round(Math.min(1, c) * 255)).join(",")})` : "transparent";
      if (tint.style.background !== css) tint.style.background = css;
    },
    /** Reduced sight in a dark cave until Flash lights it. */
    setDark(on: boolean): void {
      dark = on;
    },
    /** Where a ground point of the current map is on the page, in CSS pixels relative to the host; `lift` game pixels above it. */
    project(x: number, y: number, lift = 0): { x: number; y: number } {
      const visual = viewOf && visuals.get(viewOf.area);
      const ground = visual && visual !== "loading" ? groundAt(visual.mesh.file, viewOf!.level, x, y) : 0;
      return { x: (x - viewTopLeft.x) * screen.scale, y: (y - OBLIQUE * ground - lift - viewTopLeft.y) * screen.scale };
    },
    destroy(): void {
      observer.disconnect();
      for (const id of [...visuals.keys()]) drop(id);
      for (const actor of actors.values()) actor.sprite.geometry.dispose();
      for (const effect of effects) effect.sprite.geometry.dispose();
      particles.dispose();
      for (const r of reaches) {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
      }
      for (const m of spriteMaterials.values()) m.dispose();
      for (const p of pages) p?.dispose();
      markerMaterial.dispose();
      renderer.dispose();
      canvas.remove();
      fade.remove();
      gloom.remove();
    },
  };
}

export type GameRenderer = ReturnType<typeof createGameRenderer>;
