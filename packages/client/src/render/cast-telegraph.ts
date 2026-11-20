import { AdditiveBlending, BufferAttribute, BufferGeometry, CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Points, PointsMaterial, RingGeometry, type Scene } from "three";
import type { Entity } from "@soulsilver/shared/game";
import { TYPE_KEYS } from "@soulsilver/shared/game-data";
import { TYPE_COLORS } from "../game/type-colors";

/**
 * Block H: a move being cast shows the ground it will cover in its type's colour: a faint area with a solid
 * border, and a charge that grows from the user out to that border as the cast runs. Moves without an area
 * (self-buffs) gather rising specks of light instead. The server sends the shape (shared `telegraph`).
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
  materials: (MeshBasicMaterial | PointsMaterial)[];
}

export function createCastTelegraphs(scene: Scene) {
  const casts = new Map<number, Cast>();

  function remove(id: number): void {
    const c = casts.get(id);
    if (!c) return;
    c.root.removeFromParent();
    c.root.traverse((o) => (o instanceof Mesh || o instanceof Points) && o.geometry.dispose());
    for (const m of c.materials) m.dispose();
    casts.delete(id);
  }

  function build(e: Entity, key: string, now: number): Cast {
    const color = TYPE_COLORS[TYPE_KEYS[Number(e.data["castType"])] ?? "normal"] ?? "#ffffff";
    const shape = String(e.data["castShape"]);
    const size = Number(e.data["castSize"]);
    const span = Number(e.data["castSpan"]);
    const root = new Group();
    // Seen a snapshot (one 20 Hz tick) after the server began it, so the charge meets the border as the move goes.
    const cast: Cast = { key, start: now - 50, ms: Number(e.data["castMs"]), root, charge: undefined, rect: shape === "rect", specks: undefined, materials: [] };
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
    const aim = new Group();
    aim.rotation.z = Math.atan2(-Number(e.data["castDy"]), Number(e.data["castDx"]));
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
        const key = ["casting", "castShape", "castSize", "castSpan", "castType", "castDx", "castDy", "castMs"].map((k) => e.data[k]).join("/");
        let c = casts.get(e.id);
        if (c?.key !== key) {
          remove(e.id);
          c = build(e, key, now);
          casts.set(e.id, c);
        }
        const p = Math.min(1, Math.max(0, (now - c.start) / Math.max(1, c.ms)));
        const ground = groundOf(e);
        c.root.position.set(e.x + Number(e.data["castOx"] ?? 0), ground + LIFT_PX, e.y + Number(e.data["castOy"] ?? 0));
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
