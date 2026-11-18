import { cubicInOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

/**
 * Title ⇄ main menu. Set `slide.dir` just before switching screens: 1 slides everything up (title → menu),
 * -1 down (menu → title), 0 switches with no motion (every other screen change).
 */
export const slide = { dir: 0 as -1 | 0 | 1 };

export function slideUp(_node: Element, _params: unknown, { direction }: { direction: "in" | "out" | "both" }): TransitionConfig {
  const still = slide.dir === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // u runs 1 → 0 coming in and 0 → 1 going out: going up, the leaving screen exits above and the arriving one enters from below.
  const sign = (direction === "out" ? -1 : 1) * slide.dir;
  return { duration: still ? 0 : 450, easing: cubicInOut, css: (_t, u) => `transform: translateY(${sign * u * 100}vh)` };
}
