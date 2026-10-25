import type { Hitbox } from "./schemas.ts";

// 2D hit tests in world pixels (research R7). Every combatant body is a circle.

export interface Point {
  x: number;
  y: number;
}
export interface Body extends Point {
  r: number;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether a circle of `radius` moving from a to b touches the body. */
export const segmentHits = (a: Point, b: Point, radius: number, body: Body): boolean => segmentDistance(body, a, b) <= radius + body.r;

/** Whether a hitbox at `origin`, facing the unit vector `dir`, touches the body. */
export function overlaps(hitbox: Hitbox, origin: Point, dir: Point, body: Body): boolean {
  switch (hitbox.shape) {
    case "circle":
      return Math.hypot(body.x - origin.x, body.y - origin.y) <= hitbox.radiusPx + body.r;
    case "capsule": {
      const end = { x: origin.x + dir.x * hitbox.lengthPx, y: origin.y + dir.y * hitbox.lengthPx };
      return segmentHits(origin, end, hitbox.widthPx / 2, body);
    }
    case "arc": {
      const dx = body.x - origin.x;
      const dy = body.y - origin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > hitbox.radiusPx + body.r) return false;
      if (dist <= body.r) return true;
      const half = (hitbox.angleDeg * Math.PI) / 360;
      const angle = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dy * dir.y) / dist)));
      if (angle <= half) return true;
      // Outside the angle, the body can still touch one of the two edges.
      return [half, -half].some((h) => {
        const edge = { x: origin.x + hitbox.radiusPx * (dir.x * Math.cos(h) - dir.y * Math.sin(h)), y: origin.y + hitbox.radiusPx * (dir.x * Math.sin(h) + dir.y * Math.cos(h)) };
        return segmentDistance(body, origin, edge) <= body.r;
      });
    }
  }
}
