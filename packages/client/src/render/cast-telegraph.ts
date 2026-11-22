import { AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, Color, DoubleSide, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, type Material, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, RingGeometry, type Scene, ShaderMaterial } from "three";
import type { Entity } from "@soulsilver/shared/game";
import { TYPE_KEYS } from "@soulsilver/shared/game-data";
import { TYPE_COLORS } from "../game/type-colors";
import { OBLIQUE } from "./camera";

/**
 * Block H: a move being cast shows the ground it will cover in its type's colour: a faint area with a solid
 * border, and a charge that grows from the user out to that border as the cast runs. Moves without an area
 * (self-buffs) gather rising specks of light instead. The server sends the shape (shared `telegraph`).
 * Every cast also has motes of energy circling the user, closing in and spinning faster as the charge
 * builds, and lighting the ground under it in the type's colour (the map is unlit: the light is a glow
 * added over the ground).
 */

const AREA_OPACITY = 0.15;
const CHARGE_OPACITY = 0.35;
const BORDER_OPACITY = 0.85;
const BORDER_PX = 1.5;
/** Just over the ground, as the melee reach. */
const LIFT_PX = 0.5;
const SPECKS = 24;
const SPECK_RISE_PX = 28;
const SPECK_CYCLE_MS = 700;
export const ORBIT_MOTES = 12;
/** How flat the orbit lies: the camera sees the ground almost from above, so a full circle reads as a ring on the floor. */
export const ORBIT_FLAT = 0.45;
const LIGHT_RADIUS_PX = 36;

/**
 * Mote `i` of the orbit, `t` ms into the cast at charge `p` (0..1), around the user's feet in px (y up).
 * Its angle is the spin integrated over a charge growing with time, so the speed rises without the motes jumping.
 */
export function orbitMote(i: number, t: number, p: number) {
  const base = (i * Math.PI * 2) / ORBIT_MOTES;
  const angle = base + t * (0.004 + 0.004 * p);
  const r = 18 - 8 * p + 1.5 * Math.sin(base * 3 + t * 0.006);
  const y = 8 + (i % 3) * 5 + Math.sin(angle + i) * 3;
  const glow = (0.4 + 0.6 * p) * (0.75 + 0.25 * Math.sin(t * 0.02 + i * 1.7));
  return { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r * ORBIT_FLAT, glow, size: 3 + 2 * p };
}

/** The ground light's strength: there from the start, full at the end of the charge, flickering a little. */
export function orbitLight(p: number, t: number): number {
  return (0.35 + 0.65 * p) * (0.85 + 0.15 * Math.sin(t * 0.03));
}

const MOTE_VERTEX = /* glsl */ `
  attribute float glow;
  varying float vGlow;
  varying vec2 vUv;
  void main() {
    vGlow = glow;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
/** A white-hot core inside a halo of the type's colour, added over the scene. */
const MOTE_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  varying float vGlow;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float halo = pow(max(0.0, 1.0 - d), 2.0);
    float core = smoothstep(0.45, 0.0, d);
    gl_FragColor = vec4(mix(color, vec3(1.0), core) * (halo + core) * vGlow, 1.0);
  }
`;
const LIGHT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const LIGHT_FRAGMENT = /* glsl */ `
  uniform vec3 color;
  uniform float level;
  varying vec2 vUv;
  void main() {
    float d = length((vUv - 0.5) * 2.0);
    gl_FragColor = vec4(color * pow(max(0.0, 1.0 - d), 1.8) * level * 0.8, 1.0);
  }
`;

interface Cast {
  /** Changes with a new cast. */
  key: string;
  start: number;
  ms: number;
  root: Group;
  /** Scaled 0 → 1 with the charge (rect: along the aim only). */
  charge: Mesh | undefined;
  rect: boolean;
  specks: Points | undefined;
  /** Turned to the aim, which a contact move's charge follows. */
  aim: Group;
  /** At the user's feet, not at the area's origin. */
  around: Group;
  motes: InstancedMesh<PlaneGeometry, ShaderMaterial>;
  light: Mesh<PlaneGeometry, ShaderMaterial>;
  materials: Material[];
}

export function createCastTelegraphs(scene: Scene) {
  const casts = new Map<number, Cast>();
  const mote = new Matrix4();

  function remove(id: number): void {
    const c = casts.get(id);
    if (!c) return;
    for (const g of [c.root, c.around]) {
      g.removeFromParent();
      g.traverse((o) => {
        if (o instanceof Mesh || o instanceof Points) (o.geometry as BufferGeometry).dispose();
      });
    }
    for (const m of c.materials) m.dispose();
    casts.delete(id);
  }

  function build(e: Entity, key: string, now: number): Cast {
    const color = TYPE_COLORS[TYPE_KEYS[Number(e.data["castType"])] ?? "normal"] ?? "#ffffff";
    const shape = String(e.data["castShape"]);
    const size = Number(e.data["castSize"]);
    const span = Number(e.data["castSpan"]);
    const root = new Group();
    const aim = new Group();
    const around = new Group();
    const tint = new Color(color);
    const motes = new InstancedMesh(
      new PlaneGeometry(1, 1).setAttribute("glow", new InstancedBufferAttribute(new Float32Array(ORBIT_MOTES), 1).setUsage(DynamicDrawUsage)),
      new ShaderMaterial({ vertexShader: MOTE_VERTEX, fragmentShader: MOTE_FRAGMENT, uniforms: { color: { value: tint } }, transparent: true, depthWrite: false, blending: AdditiveBlending }),
      ORBIT_MOTES,
    );
    motes.instanceMatrix.setUsage(DynamicDrawUsage);
    motes.frustumCulled = false;
    const light = new Mesh(
      new PlaneGeometry(LIGHT_RADIUS_PX * 2, LIGHT_RADIUS_PX * 2).rotateX(-Math.PI / 2),
      new ShaderMaterial({ vertexShader: LIGHT_VERTEX, fragmentShader: LIGHT_FRAGMENT, uniforms: { color: { value: tint }, level: { value: 0 } }, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    light.position.y = LIFT_PX;
    light.renderOrder = 3;
    light.frustumCulled = false;
    around.add(light, motes);
    scene.add(around);
    // Seen a snapshot (one 20 Hz tick) after the server began it, so the charge meets the border as the move goes.
    const cast: Cast = { key, start: now - 50, ms: Number(e.data["castMs"]), root, charge: undefined, rect: shape === "rect", specks: undefined, aim, around, motes, light, materials: [motes.material, light.material] };
    const material = (opacity: number) => {
      const m = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: DoubleSide });
      cast.materials.push(m);
      return m;
    };
    if (shape === "aura") {
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(SPECKS * 3), 3));
      geometry.setAttribute("color", new BufferAttribute(new Float32Array(SPECKS * 3), 3));
      const m = new PointsMaterial({ color, vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: false });
      cast.materials.push(m);
      cast.specks = new Points(geometry, m);
      cast.specks.frustumCulled = false;
      root.add(cast.specks);
      scene.add(root);
      return cast;
    }
    // Drawn flat in a plane where +x is the aim: local +y becomes world -z, so the world aim (dx, dy) is the angle atan2(-dy, dx).
    const flat = new Group();
    flat.rotation.x = -Math.PI / 2;
    flat.add(aim);
    root.add(flat);
    const area = material(AREA_OPACITY);
    const charge = material(CHARGE_OPACITY);
    const border = material(BORDER_OPACITY);
    const add = (mesh: Mesh, order: number) => {
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      aim.add(mesh);
      return mesh;
    };
    /** A border line `len` long from (x, y) at `angle`. */
    const line = (len: number, x: number, y: number, angle: number) => {
      const bar = add(new Mesh(new PlaneGeometry(len, BORDER_PX), border), 2);
      bar.position.set(x + (Math.cos(angle) * len) / 2, y + (Math.sin(angle) * len) / 2, 0);
      bar.rotation.z = angle;
    };
    if (shape === "rect") {
      add(new Mesh(new PlaneGeometry(size, span).translate(size / 2, 0, 0), area), 0);
      cast.charge = add(new Mesh(new PlaneGeometry(1, span).translate(0.5, 0, 0), charge), 1);
      line(size, 0, -span / 2, 0);
      line(size, 0, span / 2, 0);
      line(span, 0, -span / 2, Math.PI / 2);
      line(span, size, -span / 2, Math.PI / 2);
    } else {
      const angle = shape === "arc" ? (span * Math.PI) / 180 : Math.PI * 2;
      const from = -angle / 2;
      add(new Mesh(new CircleGeometry(size, 48, from, angle), area), 0);
      cast.charge = add(new Mesh(new CircleGeometry(1, 48, from, angle), charge), 1);
      add(new Mesh(new RingGeometry(size - BORDER_PX, size, 48, 1, from, angle), border), 2);
      if (shape === "arc") {
        line(size, 0, 0, from);
        line(size, 0, 0, -from);
      }
    }
    scene.add(root);
    return cast;
  }

  return {
    /** Starts, follows and ends the casts of the entities drawn this frame; `pixelScale` is canvas px per game px. */
    draw(entities: Iterable<Entity>, groundOf: (e: Entity) => number, now: number, pixelScale: number): void {
      const seen = new Set<number>();
      for (const e of entities) {
        if (e.kind !== "pokemon" || typeof e.data["castShape"] !== "string") continue;
        seen.add(e.id);
        const key = ["casting", "castShape", "castSize", "castSpan", "castType", "castMs"].map((k) => e.data[k]).join("/");
        let c = casts.get(e.id);
        if (c?.key !== key) {
          remove(e.id);
          c = build(e, key, now);
          casts.set(e.id, c);
        }
        const p = Math.min(1, Math.max(0, (now - c.start) / Math.max(1, c.ms)));
        const ground = groundOf(e);
        c.root.position.set(e.x + Number(e.data["castOx"] ?? 0), ground + LIFT_PX, e.y + Number(e.data["castOy"] ?? 0));
        c.aim.rotation.z = Math.atan2(-Number(e.data["castDy"]), Number(e.data["castDx"]));
        const t = now - c.start;
        c.around.position.set(e.x, ground, e.y);
        c.light.material.uniforms["level"]!.value = orbitLight(p, t);
        const glow = c.motes.geometry.getAttribute("glow") as InstancedBufferAttribute;
        for (let i = 0; i < ORBIT_MOTES; i++) {
          const m = orbitMote(i, t, p);
          // Upright quads: the camera shortens heights by OBLIQUE, so they are stretched back to round.
          c.motes.setMatrixAt(i, mote.makeScale(m.size, m.size / OBLIQUE, 1).setPosition(m.x, m.y, m.z));
          glow.setX(i, m.glow);
        }
        c.motes.instanceMatrix.needsUpdate = true;
        glow.needsUpdate = true;
        if (c.charge) {
          const k = Math.max(0.001, p);
          const size = Number(e.data["castSize"]);
          if (c.rect) c.charge.scale.set(size * k, 1, 1);
          else c.charge.scale.set(size * k, size * k, 1);
        }
        if (c.specks) {
          // Each speck rises from a ring around the user and fades; they brighten as the charge builds.
          (c.specks.material as PointsMaterial).size = 2 * pixelScale;
          const pos = c.specks.geometry.getAttribute("position") as BufferAttribute;
          const col = c.specks.geometry.getAttribute("color") as BufferAttribute;
          for (let i = 0; i < SPECKS; i++) {
            const phase = (now / SPECK_CYCLE_MS + i / SPECKS + (i % 5) * 0.13) % 1;
            const a = i * 2.39996;
            const r = 6 + (i % 3) * 3;
            pos.setXYZ(i, Math.cos(a) * r, phase * SPECK_RISE_PX, Math.sin(a) * r * 0.6);
            const glow = (1 - phase) * (0.35 + 0.65 * p);
            col.setXYZ(i, glow, glow, glow);
          }
          pos.needsUpdate = true;
          col.needsUpdate = true;
        }
      }
      for (const id of [...casts.keys()]) if (!seen.has(id)) remove(id);
    },
    dispose(): void {
      for (const id of [...casts.keys()]) remove(id);
    },
  };
}
