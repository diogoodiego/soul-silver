import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial, type Scene } from "three";
import type { Entity } from "@soulsilver/shared/game";

/**
 * Block H: a Pokémon whose stat stage just dropped (any `stg_*` lower than last frame: Growl, Leer, Haze…)
 * gets dim specks sinking around it for a moment (GameSession shows a scared face while a stage stays lowered).
 */

const DEBUFF_MS = 1400;
const SPECKS = 18;
const SPECK_FALL_PX = 30;
const SPECK_CYCLE_MS = 600;
const COLOR = "#7a5cff";

interface Debuff {
  until: number;
  specks: Points<BufferGeometry, PointsMaterial>;
}

/** Whether any stat stage in `now` is lower than in `before` (missing keys are stage 0). */
export function stageDropped(before: Entity["data"], now: Entity["data"]): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(now)].filter((k) => k.startsWith("stg_")));
  return [...keys].some((k) => Number(now[k] ?? 0) < Number(before[k] ?? 0));
}

export function createDebuffs(scene: Scene) {
  const seen = new Map<number, Entity["data"]>();
  const live = new Map<number, Debuff>();

  function remove(id: number): void {
    const d = live.get(id);
    if (!d) return;
    d.specks.removeFromParent();
    d.specks.geometry.dispose();
    d.specks.material.dispose();
    live.delete(id);
  }

  return {
    draw(entities: Iterable<Entity>, groundOf: (e: Entity) => number, now: number, pixelScale: number): void {
      const drawn = new Set<number>();
      for (const e of entities) {
        if (e.kind !== "pokemon") continue;
        drawn.add(e.id);
        const before = seen.get(e.id);
        seen.set(e.id, e.data);
        let d = live.get(e.id);
        if (before && stageDropped(before, e.data)) {
          if (!d) {
            const geometry = new BufferGeometry();
            geometry.setAttribute("position", new BufferAttribute(new Float32Array(SPECKS * 3), 3));
            geometry.setAttribute("color", new BufferAttribute(new Float32Array(SPECKS * 3), 3));
            d = { until: 0, specks: new Points(geometry, new PointsMaterial({ color: COLOR, vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: false })) };
            d.specks.frustumCulled = false;
            scene.add(d.specks);
            live.set(e.id, d);
          }
          d.until = now + DEBUFF_MS;
        }
        if (!d) continue;
        if (now >= d.until) {
          remove(e.id);
          continue;
        }
        // Each speck sinks from over the head to the feet on a ring around the Pokémon, fading as it goes.
        d.specks.position.set(e.x, groundOf(e), e.y);
        d.specks.material.size = 2 * pixelScale;
        const fade = Math.min(1, (d.until - now) / 300);
        const pos = d.specks.geometry.getAttribute("position") as BufferAttribute;
        const col = d.specks.geometry.getAttribute("color") as BufferAttribute;
        for (let i = 0; i < SPECKS; i++) {
          const phase = (now / SPECK_CYCLE_MS + i / SPECKS + (i % 4) * 0.17) % 1;
          const a = i * 2.39996;
          const r = 7 + (i % 3) * 3;
          pos.setXYZ(i, Math.cos(a) * r, (1 - phase) * SPECK_FALL_PX, Math.sin(a) * r * 0.6);
          const glow = Math.sin(phase * Math.PI) * fade;
          col.setXYZ(i, glow, glow, glow);
        }
        pos.needsUpdate = true;
        col.needsUpdate = true;
      }
      for (const id of [...seen.keys()]) if (!drawn.has(id)) seen.delete(id);
      for (const id of [...live.keys()]) if (!drawn.has(id)) remove(id);
    },
    dispose(): void {
      for (const id of [...live.keys()]) remove(id);
    },
  };
}
