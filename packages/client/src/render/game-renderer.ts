import { HOP_TICKS, tileAt, WARP_TICKS, type Entity, type HitEvent, type WorldMap } from "@soulsilver/shared/game";
import { ANIMATION_FRAME_MS, MAP_TILE_PX, type Direction } from "@soulsilver/shared/maps";
import { parseSpriteFile, type SpriteEmitter, type SpriteFrame, type SpriteSetFile } from "@soulsilver/shared/sprites";
import { BALL_PX, createPokeBall, poseCapture, poseFlight, type PokeBall } from "./poke-ball";
import { createBeam, summonPhase } from "./summon";
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Camera,
  ColorManagement,
  CircleGeometry,
  DirectionalLight,
  DoubleSide,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  NoColorSpace,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { clampCamera, fillView, OBLIQUE, obliqueProjection, SPRITE_DEPTH_BIAS, VIEW_H, VIEW_W, type Bounds } from "./camera";
import { loadBitmap, loadMapMesh, loadPropMesh, spriteUrl, type ClientWorld, type MapMesh } from "./map-assets";
import { CLEARING_RADIUS_PX, clearings } from "./grass-clearing";
import { buildMapObject, groundAt, SHADE, setGrassClearings, type MapObject } from "./map-scene";
import { createParticles, effectsOf } from "./particles";
import { createFlamethrower, FLAMETHROWER_MOVE } from "./flamethrower";
import { createCastTelegraphs } from "./cast-telegraph";
import { createDebuffs } from "./debuff";
import { createPost } from "./post";
import { DEFAULT_SETTINGS, type AppSettings } from "@soulsilver/shared";

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
/** A thrown ball flies at this height over the ground, in map pixels. */
const BALL_FLIGHT_PX = 6;
/** Beam ends: the trainer's chest and the Pokémon's middle, in map pixels above their feet. */
const BEAM_FROM_PX = 14;
const BEAM_TO_PX = 8;
const BEAM_WIDTH_PX = 3;
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
/** Where the light comes from (x east, y up, z south): a fixed sun from the north-west, and nearly overhead indoors and in caves. */
// A high sun (~75°): a standing sprite's shadow is about a third of its height, pooled at the feet, not a long streak below them.
export const SUN_FROM = new Vector3(-0.4, 2.5, -0.5).normalize();
const ROOF_FROM = new Vector3(-0.1, 1, -0.3).normalize();
/**
 * The sprite casts from this far north of its feet, so its shadow starts up under them: the thin legs cast
 * little and the body's shadow lands a few pixels south of the feet. Screen pixels; raise it if a gap shows.
 */
const SHADOW_NUDGE_PX = 4;
export const LIGHT_DISTANCE = 500;
/** Light-space depth kept around the player: narrow, so the bias stays under a pixel and shadows touch the feet. */
export const LIGHT_DEPTH = 400;
/** Shadow darkness at strength 100. */
export const MAX_SHADE = 0.55;
/** Shadow map side and PCF blur radius per quality: low is cheaper and harder-edged. */
export const SHADOW_QUALITY = { low: { size: 1024, radius: 1.5 }, high: { size: 2048, radius: 4 } } as const;

const FACING: Record<Direction, string> = { north: "up", south: "down", east: "right", west: "left" };

interface MapVisual {
  mesh: MapMesh;
  object: MapObject;
}

interface Actor {
  sprite: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** Item V.2: the sprite at its true feet, drawing nothing on screen, only into the shadow map (SPRITE_DEPTH_BIAS would float the shadow). */
  caster: Mesh<BufferGeometry, MeshBasicMaterial>;
  last: { x: number; y: number };
  moving: boolean;
  /** Where its last grass rustle started; null out of the grass, so stepping in rustles at once. */
  rustledAt: { x: number; y: number } | null;
  /** When its last rustle ends: until then the rustle covers the feet, after it the grass tuft does. */
  rustleUntil: number;
  /** The grass tuft over its feet while it stands in the grass (the rustle's settled last frame), so the cut sprite never shows a straight edge. */
  cover?: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** Block C: its double while it dodges, sharing the sprite's quad. */
  ghost?: Mesh<BufferGeometry, MeshBasicMaterial>;
}

/** Block C: a dodging Pokémon is drawn twice, the two swapping sides this often, this far apart. */
const DODGE_SWAP_MS = 40;
const DODGE_SPREAD_PX = 5;
/** Block C: a stunned (parried) Pokémon lies on its side, fallen back from the way it faces. */
const STUN_TILT = Math.PI / 2;
/** Block C: the light band crossing a parrying or guarding Pokémon: this many pixels a second, once every this many pixels. */
const GLOW_SPEED_PX = 160;
const GLOW_PERIOD_PX = 80;

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

export function pixelTexture(image: ImageBitmap): Texture {
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
/** `tilt` (radians, + clockwise on screen) topples the sprite over the bottom corner it falls toward. */
function setQuad(geometry: BufferGeometry, { frame, page }: Frame, rows: number, tilt = 0): void {
  const image = page.image as ImageBitmap;
  const corners = [
    [0, 0],
    [frame.w, 0],
    [0, rows],
    [frame.w, rows],
  ] as const;
  const pivot = tilt > 0 ? frame.w - frame.anchor.x : -frame.anchor.x;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  // Rotated in screen pixels (y up), then stretched as the oblique view wants.
  const at = (x: number, y: number) => [pivot + (x - pivot) * cos + y * sin, (-(x - pivot) * sin + y * cos) / OBLIQUE, 0];
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(corners.flatMap(([c, r]) => at(c - frame.anchor.x, frame.anchor.y - r))), 3));
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
  // Item V.2: one light only for shadows (every material is unlit); it follows the player and casts while the effect is on.
  renderer.shadowMap.enabled = true;
  const light = new DirectionalLight();
  // Over the 800 px depth range: under 1 px, enough against acne under a high sun.
  light.shadow.bias = -0.001;
  scene.add(light, light.target);

  // Host size -> whole-number scale, and a view as large as the host at that scale: no bars (FR-012).
  let screen = fillView(VIEW_W, VIEW_H);
  let viewTopLeft = { x: 0, y: 0 };
  /** The map and level drawn last: projected points stand on its ground, as the camera does. */
  let viewOf: { area: string; level: number } | undefined;
  // Item V.1: with effects on, the canvas is screen-sized and post draws the native frame into it.
  let visual: AppSettings["visual"] = DEFAULT_SETTINGS.visual;
  let outdoor = false;
  /** Sun for the sky effects (god rays, cloud shadows), 0 at night and 1 at day. */
  let sun = 0;
  let post: ReturnType<typeof createPost> | undefined;
  const fit = () => {
    screen = fillView(host.clientWidth, host.clientHeight);
    const s = post ? screen.scale : 1;
    renderer.setSize(screen.w * s, screen.h * s, false);
    post?.setSize(screen.w, screen.h, screen.scale);
    // The CRT filter (app.css) draws one scanline per game pixel row: it needs that row's height on the page.
    document.documentElement.style.setProperty("--crt-px", `${screen.scale}px`);
    document.documentElement.toggleAttribute("data-crt-coarse", screen.scale < 3);
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
  const inBall = new Map<number, { start: number; shakes: number; caught: boolean | undefined }>();
  /** The 3D Poké Ball of each thrown ball in flight and of each wild Pokémon in `inBall`. */
  const balls = new Map<number, PokeBall>();
  /** A player's Pokémon by entity: the species drawn last frame, and its summon animation while it plays. */
  const ownSpecies = new Map<number, unknown>();
  const summons = new Map<number, { start: number; beam: ReturnType<typeof createBeam> }>();
  /** No summons for what is already out when the world is first drawn. */
  let summonsPrimed = false;
  const tintedMaterials = new Map<string, MeshBasicMaterial>();
  /** The sprite page tinted: red for the Pokémon forming out of the beam. */
  const tinted = (page: Texture, color: number) => {
    let material = tintedMaterials.get(`${page.uuid}/${color}`);
    if (!material) {
      material = new MeshBasicMaterial({ map: page, alphaTest: 0.5, side: DoubleSide, color });
      tintedMaterials.set(`${page.uuid}/${color}`, material);
    }
    return material;
  };
  const endSummon = (id: number) => {
    summons.get(id)?.beam.dispose();
    summons.delete(id);
  };

  /** A player's Pokémon that comes out or changes species (a swap) forms out of a red beam from its trainer. */
  function summonStep(e: Entity, actor: Actor, now: number): void {
    const owner = e.data["owner"];
    if (e.kind !== "pokemon" || typeof owner !== "string" || !/^\d+$/.test(owner)) return;
    const species = e.data["species"];
    if (summonsPrimed && ownSpecies.get(e.id) !== species) {
      endSummon(e.id);
      summons.set(e.id, { start: now, beam: createBeam(scene) });
    }
    ownSpecies.set(e.id, species);
    const summon = summons.get(e.id);
    if (!summon) return;
    const phase = summonPhase(now - summon.start);
    if (phase.done) return endSummon(e.id);
    actor.sprite.visible &&= phase.visible;
    actor.sprite.scale.setScalar(phase.scale);
    const map = (actor.sprite.material as MeshBasicMaterial).map;
    if (phase.red && map && actor.sprite.material !== markerMaterial) actor.sprite.material = tinted(map, 0xff3030);
    actor.caster.visible = false;
    // The beam leaves the nearest trainer on the map: the companion keeps by its own.
    let trainer: Actor | undefined;
    let best = Infinity;
    for (const other of latest.values()) {
      const d = other.kind === "player" && other.area === e.area ? Math.hypot(other.x - e.x, other.y - e.y) : Infinity;
      if (d < best) [best, trainer] = [d, actors.get(other.id)];
    }
    if (!phase.beam || !trainer) return void summon.beam.set(new Vector3(), new Vector3(), 0);
    const from = trainer.sprite.position.clone().add(new Vector3(0, BEAM_FROM_PX, 0));
    const to = actor.sprite.position.clone().add(new Vector3(0, BEAM_TO_PX, 0));
    summon.beam.set(from.clone().lerp(to, phase.beam.tail), from.clone().lerp(to, phase.beam.head), BEAM_WIDTH_PX);
  }
  // The Poké Ball is the only lit mesh: a soft fill so its shaded side is not black.
  scene.add(new AmbientLight(0xffffff, 0.55));
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
  const flamethrower = createFlamethrower(scene);
  const telegraphs = createCastTelegraphs(scene);
  const debuffs = createDebuffs(scene);
  /** Entities drawn last frame, so effects can follow them. */
  let latest = new Map<number, Entity>();
  /** Grass clearings this frame (fights), where sprites show their feet. */
  let cleared: { x: number; y: number }[] = [];
  const anchorOf = (id: number) => () => {
    const e = latest.get(id);
    return e && { x: e.x, y: e.y, ground: groundOf(e) };
  };

  /** Where a status plays: nowhere once its Pokémon is knocked out, which ends it at once. */
  const statusAnchor = (id: number) => {
    const anchor = anchorOf(id);
    return () => (latest.get(id)?.data["hp"] === 0 ? undefined : anchor());
  };
  /** Where statuses start, as a share of the sprite's height: behind the body these would hardly show. Others, mid-height. */
  const STATUS_HEIGHT: Record<string, number | undefined> = { freeze: 1, paralysis: 1, sleep: 1, poison: 0.75, toxic: 0.75 };
  /** Height of the top of a drawn sprite over its feet (setQuad's first corner). */
  const heightOf = (id: number) => actors.get(id)?.sprite.geometry.getAttribute("position")?.getY(0);
  const statusLift = (id: number, share: number) => () => {
    const height = heightOf(id);
    return height === undefined ? undefined : height * share;
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
    if (move === FLAMETHROWER_MOVE) {
      flamethrower.play(anchorOf(e.id), { x: Number(e.data["usedDx"]), y: Number(e.data["usedDy"]) }, now);
      return;
    }
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
      if (e.kind === "projectile" && typeof e.data["move"] === "number") {
        const key = `${e.id}/move/${e.data["move"]}`;
        wanted.add(key);
        particles.play(emittersAt(e.data["move"], "travel"), anchorOf(e.id), now, key, true);
      }
      if (e.kind !== "pokemon" || e.data["hp"] === 0) continue;
      const statuses = [...(typeof e.data["status"] === "string" && e.data["status"] !== "" ? [e.data["status"]] : []), ...(e.data["confused"] === true ? ["confusion"] : [])];
      for (const status of statuses) {
        const key = `${e.id}/status/${status}`;
        const share = STATUS_HEIGHT[status];
        wanted.add(key);
        particles.play(battleFx.get(`status/${status}`), statusAnchor(e.id), now, key, true, undefined, { lift: share === undefined ? undefined : statusLift(e.id, share) });
      }
    }
    for (const key of [...particles.keys()]) if (!key.startsWith("once/") && !wanted.has(key)) particles.stop(key);
    particles.update(now);
    flamethrower.update(now);
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
  // Block C: parrying and guarding, a sprite turns white and a band of light sweeps across it.
  const glowTime = { value: 0 };
  const glowMaterials = new Map<Texture, MeshBasicMaterial>();
  const glowMaterial = (page: Texture) => {
    let material = glowMaterials.get(page);
    if (!material) {
      material = new MeshBasicMaterial({ map: page, alphaTest: 0.5, side: DoubleSide });
      material.customProgramCacheKey = () => "block-c-glow";
      material.onBeforeCompile = (shader) => {
        shader.uniforms["uGlowTime"] = glowTime;
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vGlow;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = position.xy;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec2 vGlow;\nuniform float uGlowTime;")
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            float band = fract((vGlow.x - vGlow.y - uGlowTime * ${GLOW_SPEED_PX.toFixed(1)}) / ${GLOW_PERIOD_PX.toFixed(1)});
            diffuseColor.rgb = mix(vec3(0.86), vec3(1.0), smoothstep(0.82, 0.9, band) * (1.0 - smoothstep(0.9, 0.98, band)));`,
          );
      };
      glowMaterials.set(page, material);
    }
    return material;
  };
  // Item V.2: a sprite material that writes neither colour nor depth; the shadow pass still reads its map and alpha test.
  const casters = new Map<MeshBasicMaterial, MeshBasicMaterial>();
  const casterOf = (material: MeshBasicMaterial) => {
    let caster = casters.get(material);
    if (!caster) {
      caster = new MeshBasicMaterial({ map: material.map, alphaTest: material.alphaTest, side: DoubleSide, colorWrite: false, depthWrite: false });
      casters.set(material, caster);
    }
    return caster;
  };

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
    // Built aside and swapped in with the placement: assigned piece by piece across the awaits below, the camera
    // was clamped to half the box for a few frames after a border (west comes last) and then jumped.
    let box: Bounds = { left: 0, top: 0, right: current.widthPx, bottom: current.heightPx };
    for (const { n, map } of direct) {
      if (!map) continue;
      next.set(map.id, { dx: n.dx, dy: n.dy });
      box = {
        left: Math.min(box.left, n.dx),
        top: Math.min(box.top, n.dy),
        right: Math.max(box.right, n.dx + map.widthPx),
        bottom: Math.max(box.bottom, n.dy + map.heightPx),
      };
      const second = await Promise.all(map.neighbors.map(async (m) => ({ m, map: await world.ensure(m.map) })));
      for (const { m, map: far } of second) if (far && !next.has(far.id)) next.set(far.id, { dx: n.dx + m.dx, dy: n.dy + m.dy });
    }
    if (currentArea !== area) return;
    placement = next;
    bounds = box;
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

  /** Starts the grass rustle at the feet (x, y), in front of whoever stands there; it stays put as they walk on. */
  function rustleAt(x: number, y: number, ground: number, now: number): void {
    if (rustle.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    const sprite = new Mesh(geometry, markerMaterial);
    sprite.frustumCulled = false;
    sprite.visible = false;
    // A pixel nearer the camera than the actor on the same feet, so it covers them.
    sprite.position.set(Math.round(x), ground + SPRITE_DEPTH_BIAS, Math.round(y) + 1 + SPRITE_DEPTH_BIAS * OBLIQUE);
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
      actor = { sprite: new Mesh(geometry, markerMaterial), caster: new Mesh(geometry, markerMaterial), last: { x: e.x, y: e.y }, moving: false, rustledAt: { x: e.x, y: e.y }, rustleUntil: 0 };
      actor.sprite.frustumCulled = false;
      actor.caster.frustumCulled = false;
      actor.caster.castShadow = true;
      actor.caster.position.set(0, -SPRITE_DEPTH_BIAS, -SPRITE_DEPTH_BIAS * OBLIQUE - SHADOW_NUDGE_PX);
      actor.sprite.add(actor.caster);
      scene.add(actor.sprite);
      actors.set(e.id, actor);
    }
    const heading = Math.atan2(e.x - actor.last.x, e.y - actor.last.y);
    actor.moving = Math.hypot(e.x - actor.last.x, e.y - actor.last.y) > 0.01 || e.data["hop"] !== undefined;
    actor.last = { x: e.x, y: e.y };
    const ball = inBall.get(e.id);
    if (ball && now >= ball.start + (ball.shakes + 1) * SHAKE_MS) {
      inBall.delete(e.id);
      balls.get(e.id)?.dispose();
      balls.delete(e.id);
    }
    const frame = inBall.has(e.id) ? undefined : frameFor(e, actor.moving, running, now);
    // Knocked out: still (no idle bounce) and with none of the fight's effects, until a ball or the fight's end takes it.
    const knockedOut = e.kind === "pokemon" && e.data["hp"] === 0;
    const fight: Entity["data"] = knockedOut ? {} : e.data;
    const inGrass = tileAt(world.lookup, e.area, e.level, e.x, e.y)?.category === "tallGrass" && !cleared.some((c) => Math.hypot(c.x - e.x, c.y - e.y) <= CLEARING_RADIUS_PX);
    // One rustle per tile's worth of walking in the grass, at the feet, off the tile grid.
    if (!inGrass) actor.rustledAt = null;
    else if (!actor.rustledAt || Math.hypot(e.x - actor.rustledAt.x, e.y - actor.rustledAt.y) >= MAP_TILE_PX) {
      rustleAt(e.x, e.y, groundOf(e), now);
      actor.rustledAt = { x: e.x, y: e.y };
      actor.rustleUntil = now + rustle.reduce((ms, s) => ms + s.ms, 0);
    }
    if (frame) {
      // Pushed back by the parry, it falls away from the way it faces.
      const tilt = fight["stun"] === true ? (e.facing === "east" ? -STUN_TILT : STUN_TILT) : 0;
      setQuad(actor.sprite.geometry, frame, inGrass ? Math.max(1, frame.frame.h - GRASS_COVER_PX) : frame.frame.h, tilt);
      const shiny = e.data["shiny"] === true;
      const page = (shiny && shinyOf.get(frame.page)) || frame.page;
      actor.sprite.material = fight["parry"] === true || fight["guard"] === true ? glowMaterial(page) : spriteMaterial(page);
      // A shiny glints when it first comes into view.
      // shortcut: a blink stands in for the sparkle; use the ROM's shiny sparkle animation once it is extracted.
      if (shiny && !sparkled.has(e.id)) {
        sparkled.add(e.id);
        blinkUntil.set(e.id, now + 1200);
      }
    } else {
      if (e.kind === "projectile") markerQuad(actor.sprite.geometry, e.data["field"] === true ? 12 : 3, e.data["field"] === true ? 2 : 6);
      else markerQuad(actor.sprite.geometry);
      actor.sprite.material = markerMaterial;
    }
    const particlesOnly = e.kind === "projectile" && battleFx.has(`move/${String(e.data["move"])}`);
    const blinking = e.data["flash"] === true || (blinkUntil.get(e.id) ?? 0) > now;
    actor.sprite.visible = !particlesOnly && (!blinking || Math.floor(now / FLASH_MS) % 2 === 0);
    const bounce = ((e.kind === "pokemon" && !actor.moving && !knockedOut) || e.data["mode"] === "surf") && Math.floor(now / (IDLE_BOUNCE_MS / 2)) % 2 === 0 ? IDLE_BOUNCE_PX : 0;
    const hop = e.data["hop"];
    // shortcut: the arc steps once per server tick (the counter is not interpolated); smooth it if it reads choppy.
    // Block C: a contact move's leap takes the same arc.
    const leap = fight["leap"];
    const airborne = typeof hop === "number" ? (HOP_TICKS - hop + 0.5) / HOP_TICKS : typeof leap === "number" ? leap : 0;
    const lift = Math.round(Math.sin(Math.PI * airborne) * HOP_ARC_PX);
    const y = groundOf(e) + SPRITE_DEPTH_BIAS + bounce + lift;
    // A hit target shakes sideways while its flash lasts.
    const shake = e.data["flash"] === true ? Math.round(Math.sin(now / 15) * 2) : 0;
    // Block C: dodging, it and its double swap sides fast.
    const dodging = fight["dodge"] === true && actor.sprite.material !== markerMaterial;
    const spread = dodging ? (Math.floor(now / DODGE_SWAP_MS) % 2 === 0 ? DODGE_SPREAD_PX : -DODGE_SPREAD_PX) : 0;
    actor.sprite.position.set(Math.round(e.x) + shake + spread, y, Math.round(e.y) + SPRITE_DEPTH_BIAS * OBLIQUE);
    if (dodging && !actor.ghost) {
      actor.ghost = new Mesh(actor.sprite.geometry, actor.sprite.material);
      actor.ghost.frustumCulled = false;
      scene.add(actor.ghost);
    }
    if (actor.ghost) {
      actor.ghost.visible = dodging && actor.sprite.visible;
      actor.ghost.material = actor.sprite.material;
      actor.ghost.position.set(actor.sprite.position.x - 2 * spread, y, actor.sprite.position.z);
    }
    const settled = inGrass && actor.sprite.visible && now >= actor.rustleUntil ? frames.get(rustle.at(-1)?.frame ?? "") : undefined;
    if (settled && !actor.cover) {
      actor.cover = new Mesh(new BufferGeometry(), markerMaterial);
      actor.cover.geometry.setIndex([0, 2, 1, 1, 2, 3]);
      actor.cover.frustumCulled = false;
      scene.add(actor.cover);
    }
    if (actor.cover) {
      actor.cover.visible = settled !== undefined;
      if (settled) {
        setQuad(actor.cover.geometry, settled, settled.frame.h);
        actor.cover.material = spriteMaterial(settled.page);
        // As the rustle: a pixel nearer the camera than the feet it covers.
        actor.cover.position.set(Math.round(e.x), groundOf(e) + SPRITE_DEPTH_BIAS, Math.round(e.y) + 1 + SPRITE_DEPTH_BIAS * OBLIQUE);
      }
    }
    actor.caster.visible = actor.sprite.material !== markerMaterial;
    if (actor.caster.visible) actor.caster.material = casterOf(actor.sprite.material);
    summonStep(e, actor, now);
    // A thrown ball, and the ball a wild Pokémon is inside, are the 3D Poké Ball; the sprite (a marker) hides.
    const thrown = e.kind === "projectile" && e.data["ball"] !== undefined;
    if (thrown || (ball && inBall.has(e.id))) {
      let model = balls.get(e.id);
      if (!model) {
        model = createPokeBall();
        model.root.userData = { born: now, heading: 0 };
        scene.add(model.root);
        balls.set(e.id, model);
      }
      actor.sprite.visible = false;
      actor.caster.visible = false;
      model.root.position.set(e.x, groundOf(e) + (thrown ? BALL_FLIGHT_PX - BALL_PX / 2 : 0), e.y);
      if (actor.moving) model.root.userData["heading"] = heading;
      if (thrown) poseFlight(model, now - (model.root.userData["born"] as number), model.root.userData["heading"] as number);
      else if (ball) poseCapture(model, now - ball.start, ball.shakes, SHAKE_MS, ball.caught);
    }
  }

  return {
    /** Replaces the props on `area`; positions in the map's pixels, height included. */
    setProps(area: string, list: readonly { model: number; x: number; y: number; z: number; pose?: number | undefined }[]): void {
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
      glowTime.value = now / 1000;
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
      summonsPrimed = true;
      for (const [id, actor] of actors) {
        if (seen.has(id)) continue;
        actor.sprite.removeFromParent();
        actor.sprite.geometry.dispose();
        actor.cover?.removeFromParent();
        actor.cover?.geometry.dispose();
        actor.ghost?.removeFromParent();
        actors.delete(id);
        balls.get(id)?.dispose();
        balls.delete(id);
        endSummon(id);
        ownSpecies.delete(id);
      }
      drawEffects(now);
      drawParticles(now);
      drawReaches(now);
      telegraphs.draw(latest.values(), groundOf, now, post ? screen.scale : 1);
      debuffs.draw(latest.values(), groundOf, now, post ? screen.scale : 1);
      const mapFrame = Math.floor(now / ANIMATION_FRAME_MS);
      for (const visual of visuals.values()) if (visual !== "loading") visual.object.animate(mapFrame);
      // The view follows the player's feet as drawn: raised ground draws higher.
      const view2d = view.focus ? clampCamera(view.focus.x, view.focus.y - OBLIQUE * groundOf(self), bounds, screen) : clampCamera(self.x, self.y - OBLIQUE * groundOf(self), bounds, screen);
      viewTopLeft = view2d;
      viewOf = { area: self.area, level: self.level };
      camera.projectionMatrix.set(...(obliqueProjection(view2d.x, view2d.y, screen) as Parameters<typeof camera.projectionMatrix.set>));
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      light.castShadow = SHADE.visible = post !== undefined && visual.shadows > 0;
      if (light.castShadow) {
        SHADE.opacity = (visual.shadows / 100) * MAX_SHADE;
        light.target.position.set(self.x, groundOf(self), self.y);
        light.position.copy(outdoor ? SUN_FROM : ROOF_FROM).multiplyScalar(LIGHT_DISTANCE).add(light.target.position);
        // The view's ground spans about w by h/OBLIQUE around the player; the margin keeps casters just off screen.
        const reach = Math.max(screen.w, screen.h / OBLIQUE) * 0.75;
        const cam = light.shadow.camera;
        if (cam.right !== reach) {
          [cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far] = [-reach, reach, reach, -reach, LIGHT_DISTANCE - LIGHT_DEPTH, LIGHT_DISTANCE + LIGHT_DEPTH];
          cam.updateProjectionMatrix();
        }
      }
      if (post) post.render(scene, camera, visual, (self.y - OBLIQUE * groundOf(self) - DARK_EYE_PX - view2d.y) / screen.h, outdoor, { daylight: sun, left: view2d.x, top: view2d.y, seconds: now / 1000 });
      else renderer.render(scene, camera);
      // Black at the map swap, half way through the warp (data-model.md).
      const warping = typeof self.data["warping"] === "number" ? self.data["warping"] : 0;
      fade.style.opacity = String(warping > 0 ? 1 - Math.abs(warping - WARP_TICKS / 2) / (WARP_TICKS / 2) : 0);
      const eye = { x: (self.x - view2d.x) * screen.scale, y: (self.y - OBLIQUE * groundOf(self) - DARK_EYE_PX - view2d.y) * screen.scale };
      gloom.style.background = dark ? `radial-gradient(circle at ${eye.x}px ${eye.y}px, transparent ${DARK_RADIUS_PX * screen.scale}px, #000 ${DARK_RADIUS_PX * 1.4 * screen.scale}px)` : "none";
    },
    /** Plays the move's ROM particles on each hit target. */
    /** A ball caught this wild Pokémon: show the ball and its shakes in its place. */
    capture(wildId: number, shakes: number, now: number, caught?: boolean): void {
      inBall.set(wildId, { start: now, shakes, caught });
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
    /** How much sun there is (time/tint.ts daylight), for the god rays and cloud shadows. */
    setDaylight(next: number): void {
      sun = next;
    },
    /** HD-2D effects (item V.1); the fog only shows on outdoor maps. */
    setVisual(next: AppSettings["visual"], isOutdoor: boolean): void {
      outdoor = isOutdoor;
      if (next.quality !== visual.quality || (next.quality !== "off") !== (post !== undefined)) {
        post?.dispose();
        post = next.quality === "off" ? undefined : createPost(renderer, next.quality);
        if (next.quality !== "off") {
          const { size, radius } = SHADOW_QUALITY[next.quality];
          light.shadow.mapSize.set(size, size);
          light.shadow.radius = radius;
          // A new size needs a new map; three makes it on the next shadow pass.
          light.shadow.map?.dispose();
          light.shadow.map = null;
        }
        fit();
      }
      visual = next;
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
      for (const actor of actors.values()) {
        actor.sprite.geometry.dispose();
        actor.cover?.geometry.dispose();
      }
      for (const effect of effects) effect.sprite.geometry.dispose();
      particles.dispose();
      flamethrower.dispose();
      telegraphs.dispose();
      debuffs.dispose();
      for (const r of reaches) {
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
      }
      for (const m of spriteMaterials.values()) m.dispose();
      for (const m of casters.values()) m.dispose();
      for (const p of pages) p?.dispose();
      markerMaterial.dispose();
      post?.dispose();
      light.dispose();
      renderer.dispose();
      canvas.remove();
      fade.remove();
      gloom.remove();
    },
  };
}

export type GameRenderer = ReturnType<typeof createGameRenderer>;
