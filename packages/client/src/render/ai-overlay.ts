import type { AiDebugRow } from "@soulsilver/shared/game";

// The AI debug overlay (spec 019, FR-033): shapes in page pixels for an SVG over the game, from the
// server's aiDebug rows. Ground points go through the renderer's projection.

type Project = (x: number, y: number) => { x: number; y: number };

export interface OverlayShape {
  key: string;
  /** Vision cone as SVG polygon points. */
  cone: string;
  zone: { cx: number; cy: number; r: number };
  lastSeen: { x: number; y: number } | undefined;
  label: { x: number; y: number; lines: string[] };
}

const CONE_STEPS = 8;

export function overlayShapes(rows: readonly AiDebugRow[], at: (id: number) => { x: number; y: number } | undefined, project: Project): OverlayShape[] {
  const shapes: OverlayShape[] = [];
  for (const r of rows) {
    const me = at(r.entityId);
    if (!me) continue;
    const origin = project(me.x, me.y);
    const face = Math.atan2(r.sight.facing.y, r.sight.facing.x);
    const half = (r.sight.angleDeg * Math.PI) / 360;
    const points = [`${origin.x},${origin.y}`];
    for (let i = 0; i <= CONE_STEPS; i++) {
      const a = face - half + (2 * half * i) / CONE_STEPS;
      const p = project(me.x + Math.cos(a) * r.sight.rangePx, me.y + Math.sin(a) * r.sight.rangePx);
      points.push(`${p.x},${p.y}`);
    }
    const home = project(r.zone.x, r.zone.y);
    const edge = project(r.zone.x + r.zone.radiusPx, r.zone.y);
    const best = r.scores.map((s) => `${s.slot === r.chosenSlot ? "▶" : " "} #${s.move} ${s.score.toFixed(1)} (dmg ${s.damage.toFixed(0)} hit ${s.hit.toFixed(2)} util ${s.utility.toFixed(0)})`);
    shapes.push({
      key: `ai-${r.entityId}`,
      cone: points.join(" "),
      zone: { cx: home.x, cy: home.y, r: Math.abs(edge.x - home.x) },
      lastSeen: r.lastSeen ? project(r.lastSeen.x, r.lastSeen.y) : undefined,
      label: { x: origin.x + 12, y: origin.y - 24, lines: [`${r.state} → ${r.target ?? "—"}`, ...best] },
    });
  }
  return shapes;
}
