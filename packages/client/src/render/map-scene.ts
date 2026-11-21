import type { CollisionMap } from "@soulsilver/shared/game";
import { MAP_TILE_PX, MESH_VERTEX_FLOATS, type MeshGroup } from "@soulsilver/shared/maps";
import {
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MirroredRepeatWrapping,
  NearestFilter,
  FloatType,
  NoColorSpace,
  RepeatWrapping,
  RGFormat,
  ShadowMaterial,
  Texture,
  Vector2,
  Vector3,
  type Wrapping,
} from "three";
import type { MapMesh } from "./map-assets";
import { CLEARING_RADIUS_PX, MAX_CLEARINGS } from "./grass-clearing";
import shadowsJson from "../../../../content/maps/shadows.json";
import { groundCover } from "./ground-cover";

/** Placed models that cast no shadow: plants and flat or effect decor. */
const NO_SHADOW: ReadonlySet<string> = new Set(shadowsJson.noShadow);

// A map's mesh (shared/maps/mesh.ts) as three.js objects: one mesh per group, one texture view per
// image of the group (wrap differs per group), its scale and offset set by the frame shown.

/** Magenta, like the extractor's placeholder, where an image did not load. */
const MISSING = new MeshBasicMaterial({ color: 0xff00ff, side: DoubleSide });
/**
 * Item V.2: shadows darken the map from a second pass over each opaque group, so the ROM colors are
 * never lit. Shared by every map; the renderer sets its opacity and hides it with the effect off.
 */
export const SHADE = new ShadowMaterial({ side: DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, visible: false });

function wrapping(repeat: boolean, flip: boolean): Wrapping {
  if (!repeat) return ClampToEdgeWrapping;
  return flip ? MirroredRepeatWrapping : RepeatWrapping;
}

function groupTexture(image: ImageBitmap, group: MeshGroup): Texture {
  const texture = new Texture(image);
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = wrapping(group.repeat[0], group.flip[0]);
  texture.wrapT = wrapping(group.repeat[1], group.flip[1]);
  texture.needsUpdate = true;
  return texture;
}

function show(texture: Texture, frame: MeshGroup["frames"][number]): Texture {
  texture.repeat.set(frame.scale[0], frame.scale[1]);
  texture.offset.set(frame.translate[0], frame.translate[1]);
  return texture;
}

/** Where decor is cleared this frame, shared by every map: world x, z and radius per circle. */
export const grassClearings = {
  uClearings: { value: Array.from({ length: MAX_CLEARINGS }, () => new Vector3()) },
  uClearingCount: { value: 0 },
};

export function setGrassClearings(points: readonly { x: number; y: number }[]): void {
  points.forEach((p, i) => grassClearings.uClearings.value[i]!.set(p.x, p.y, CLEARING_RADIUS_PX));
  grassClearings.uClearingCount.value = points.length;
}

/** Tiles whose look is kept in a clearing: what has collision (walls, trees, ledges) and water. */
const KEPT = new Set(["blocked", "ledge", "water"]);
/** Decor layers (grass, its borders and shadows) lie flat this close above the ground; walls and trunks rise from it. */
const DECOR_MAX_PX = 3;

/** Per tile: R 1 when kept whole (KEPT), G the ground height. */
function grassTexture(file: MapMesh["file"], grid: CollisionMap): DataTexture {
  const data = new Float32Array(file.width * file.height * 2);
  for (let i = 0; i < file.width * file.height; i++) {
    data[i * 2] = KEPT.has(grid.tiles[i]?.category ?? "blocked") ? 1 : 0;
    data[i * 2 + 1] = file.ground[0]![i]!;
  }
  const texture = new DataTexture(data, file.width, file.height, RGFormat, FloatType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Inside a clearing, on tiles without collision, drops the flat decor above the ground: grass, its borders and shadows. */
function clearGrass(material: MeshBasicMaterial, grass: DataTexture, file: MapMesh["file"]): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, grassClearings, { uGrass: { value: grass }, uGrassSize: { value: new Vector2(file.width, file.height) } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
varying vec3 vMapPos;
varying vec3 vWorldPos;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vMapPos = position;
vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vMapPos;
varying vec3 vWorldPos;
uniform vec3 uClearings[${MAX_CLEARINGS}];
uniform int uClearingCount;
uniform sampler2D uGrass;
uniform vec2 uGrassSize;`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
// Derivatives first: they are undefined inside the loop's non-uniform flow.
vec3 surface = normalize(cross(dFdx(vMapPos), dFdy(vMapPos)));
vec2 cell = texture2D(uGrass, (floor(vMapPos.xz / ${MAP_TILE_PX.toFixed(1)}) + 0.5) / uGrassSize).rg;
float above = vMapPos.y - cell.g;
if (cell.r < 0.5 && above > 0.5 && above <= ${DECOR_MAX_PX.toFixed(1)} && abs(surface.y) > 0.9) {
  for (int i = 0; i < ${MAX_CLEARINGS}; i++) {
    if (i >= uClearingCount) break;
    if (distance(vWorldPos.xz, uClearings[i].xy) <= uClearings[i].z) discard;
  }
}`,
      );
  };
  material.customProgramCacheKey = () => "grass-clearing";
}

export interface MapObject {
  root: Group;
  /** Shows frame `k` (tick k * ANIMATION_STEP_TICKS) of the looped cycle on every animated group. */
  animate(k: number): void;
  dispose(): void;
}

/** `grid` is the map's level-0 collision: which tiles have collision, kept whole in a clearing. */
export function buildMapObject({ file, vertices, textures }: MapMesh, grid?: CollisionMap): MapObject {
  const root = new Group();
  // shortcut: level 0 only; upper levels never hide their grass, extend if a fight on one shows it.
  const grass = grid ? grassTexture(file, grid) : undefined;
  const buffer = new InterleavedBuffer(vertices, MESH_VERTEX_FLOATS);
  const geometries: BufferGeometry[] = [];
  const owned: Texture[] = [];
  const animated: { material: MeshBasicMaterial; group: MeshGroup; views: Map<number, Texture> }[] = [];

  for (const group of file.groups) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute("uv", new InterleavedBufferAttribute(buffer, 2, 3));
    geometry.setAttribute("color", new InterleavedBufferAttribute(buffer, 3, 5));
    geometry.setDrawRange(group.first, group.count);
    geometries.push(geometry);

    const images = group.frames.map((f) => textures[f.texture]);
    if (images.some((i) => !i)) {
      root.add(new Mesh(geometry, MISSING));
      continue;
    }
    // shortcut: every frame uses uv over the first frame's size; a pattern frame of another size would stretch, none seen in the ROM.
    // One view per image, not per frame: a cycle has hundreds of frames over a few images.
    const views = new Map<number, Texture>();
    group.frames.forEach((f, k) => {
      if (!views.has(f.texture)) views.set(f.texture, groupTexture(images[k]!, group));
    });
    owned.push(...views.values());
    const material = new MeshBasicMaterial({
      map: show(views.get(group.frames[0]!.texture)!, group.frames[0]!),
      vertexColors: true,
      side: DoubleSide,
      transparent: group.translucent,
      opacity: group.alpha,
      depthWrite: !group.translucent,
      // DS alpha test: fully transparent texels are never drawn.
      alphaTest: group.translucent ? 1 / 255 : 0.5,
    });
    if (grass) clearGrass(material, grass, file);
    if (group.frames.length > 1) animated.push({ material, group, views });
    const mesh = new Mesh(geometry, material);
    // Block H: only placed models cast (houses, buildings, furniture), not the terrain nor the plants and decor
    // content/maps/shadows.json lists. Flowers and other decals on the ground cast none (their shadow would land beside them).
    mesh.castShadow = group.building !== undefined && !NO_SHADOW.has(group.building) && !groundCover(file, vertices, group);
    root.add(mesh);
    if (!group.translucent) {
      const shade = new Mesh(geometry, SHADE);
      shade.receiveShadow = true;
      root.add(shade);
    }
  }

  // Groups share one buffer and are drawn by range, so three cannot bound them; culling is off.
  root.traverse((o) => (o.frustumCulled = false));

  return {
    root,
    animate(k) {
      for (const a of animated) {
        const frame = a.group.frames[k % a.group.frames.length]!;
        a.material.map = show(a.views.get(frame.texture)!, frame);
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const t of owned) t.dispose();
      grass?.dispose();
      root.traverse((o) => {
        if (o instanceof Mesh && o.material !== MISSING && o.material !== SHADE) (o.material as MeshBasicMaterial).dispose();
      });
    },
  };
}

/** Ground height (pixels) where an entity stands: its tile on its level, the top level if it has fewer. */
export function groundAt(file: MapMesh["file"], level: number, x: number, y: number): number {
  const tx = Math.min(file.width - 1, Math.max(0, Math.floor(x / MAP_TILE_PX)));
  const tz = Math.min(file.height - 1, Math.max(0, Math.floor(y / MAP_TILE_PX)));
  const heights = file.ground[Math.min(level, file.ground.length - 1)]!;
  // shortcut: one height per tile, so stairs and slopes step a tile at a time; interpolate if it shows.
  return heights[tz * file.width + tx]!;
}
