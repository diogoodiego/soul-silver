import type { Point } from "./hitbox.ts";
import type { Behavior, Hitbox } from "./schemas.ts";

/**
 * Block H: the ground a move covers while it is cast, as clients draw it. Offsets are from the user, in world px.
 * circle: `size` is the radius; arc: radius and `span` degrees around the aim; rect: `size` long from the
 * origin along the aim, `span` wide; aura: no area (self-buff), only a glow on the user.
 */
export interface Telegraph {
  shape: "circle" | "arc" | "rect" | "aura";
  ox: number;
  oy: number;
  size: number;
  span: number;
}

export function telegraph(move: { behavior: Behavior; rangePx: number; hitbox: Hitbox | undefined }, dir: Point): Telegraph {
  const { hitbox } = move;
  if (!hitbox) return { shape: "aura", ox: 0, oy: 0, size: 0, span: 0 };
  if (hitbox.shape === "arc") return { shape: "arc", ox: 0, oy: 0, size: hitbox.radiusPx, span: hitbox.angleDeg };
  if (hitbox.shape === "capsule") return { shape: "rect", ox: 0, oy: 0, size: hitbox.lengthPx, span: hitbox.widthPx };
  const r = hitbox.radiusPx;
  // A travelling hitbox sweeps its range; it reaches one radius further on each end.
  if (move.behavior === "projectile" || move.behavior === "dash") return { shape: "rect", ox: 0, oy: 0, size: move.rangePx + 2 * r, span: 2 * r };
  const ahead = move.behavior === "target-area" || move.behavior === "field" ? move.rangePx : 0;
  return { shape: "circle", ox: dir.x * ahead, oy: dir.y * ahead, size: r, span: 0 };
}

/** Moves that aim themselves at the nearest foe; self-centred ones keep the input direction. */
export const AIMED: ReadonlySet<Behavior> = new Set<Behavior>(["melee", "projectile", "beam", "target-area", "dash", "target-debuff"]);
/** Block C: moves of these behaviors leap to their target. */
export const CONTACT: ReadonlySet<Behavior> = new Set<Behavior>(["melee", "dash"]);
/** The dodge's displacement. shortcut: fixed, move to combat content JSON if it needs balancing. */
export const DODGE_TICKS = 4;
export const DODGE_PX = 8;

/** Block C: what a client needs to show a move's cast in the frame of the press, before the server's state does. */
export interface CastKit {
  shape: Telegraph["shape"];
  size: number;
  span: number;
  /** How far ahead of the user the area lies. */
  ahead: number;
  type: number;
  castMs: number;
  aim: "foe" | "facing";
  leap: boolean;
}

export function castKit(move: { behavior: Behavior; rangePx: number; hitbox: Hitbox | undefined; type: number }, castMs: number): CastKit {
  const { shape, size, span, ox } = telegraph(move, { x: 1, y: 0 });
  return { shape, size, span, ahead: ox, type: move.type, castMs, aim: AIMED.has(move.behavior) ? "foe" : "facing", leap: CONTACT.has(move.behavior) };
}

/** As text, since entity data holds only plain values. */
export const packKit = (k: CastKit): string => [k.shape, k.size, k.span, k.ahead, k.type, k.castMs, k.aim, k.leap ? 1 : 0].join("|");

export function unpackKit(text: unknown): CastKit | undefined {
  if (typeof text !== "string") return undefined;
  const [shape, size, span, ahead, type, castMs, aim, leap] = text.split("|");
  const numbers = [size, span, ahead, type, castMs].map(Number);
  if ((shape !== "circle" && shape !== "arc" && shape !== "rect" && shape !== "aura") || (aim !== "foe" && aim !== "facing") || numbers.some((n) => !Number.isFinite(n))) return undefined;
  return { shape, size: numbers[0]!, span: numbers[1]!, ahead: numbers[2]!, type: numbers[3]!, castMs: numbers[4]!, aim, leap: leap === "1" };
}

/** A cast as entity data, for the clients' charge: toward `dir`, from where a leap of `leapPx` would land. */
export const castData = (k: CastKit, dir: Point, leapPx: number) => ({
  castMs: k.castMs,
  castType: k.type,
  castShape: k.shape,
  castOx: Math.round(dir.x * (k.ahead + leapPx)),
  castOy: Math.round(dir.y * (k.ahead + leapPx)),
  castSize: k.size,
  castSpan: k.span,
  castDx: Math.round(dir.x * 100),
  castDy: Math.round(dir.y * 100),
});
