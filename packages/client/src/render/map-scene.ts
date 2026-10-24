import { MAP_TILE_PX, MESH_VERTEX_FLOATS, type MeshGroup } from "@soulsilver/shared/maps";
import {
  BufferGeometry,
  ClampToEdgeWrapping,
  DoubleSide,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MirroredRepeatWrapping,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  Texture,
  type Wrapping,
} from "three";
import type { MapMesh } from "./map-assets";

// A map's mesh (shared/maps/mesh.ts) as three.js objects: one mesh per group, one texture view per
// image of the group (wrap differs per group), its scale and offset set by the frame shown.

/** Magenta, like the extractor's placeholder, where an image did not load. */
const MISSING = new MeshBasicMaterial({ color: 0xff00ff, side: DoubleSide });

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

export interface MapObject {
  root: Group;
  /** Shows frame `k` (tick k * ANIMATION_STEP_TICKS) of the looped cycle on every animated group. */
  animate(k: number): void;
  dispose(): void;
}

export function buildMapObject({ file, vertices, textures }: MapMesh): MapObject {
  const root = new Group();
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
    if (group.frames.length > 1) animated.push({ material, group, views });
    root.add(new Mesh(geometry, material));
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
      root.traverse((o) => {
        if (o instanceof Mesh && o.material !== MISSING) (o.material as MeshBasicMaterial).dispose();
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
