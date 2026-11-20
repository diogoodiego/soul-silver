import type { Action } from "@soulsilver/shared/input";
import type { Input } from "./input";

// Menus with the pad or the keyboard (spec 017, research R4): directions move the DOM focus to the
// nearest focusable element that way, confirm clicks it, cancel goes back. The mouse keeps working
// through plain clicks.

type Rect = { left: number; top: number; width: number; height: number };
type Direction = "up" | "down" | "left" | "right";

/** Index of the element to focus from `from` towards `dir`; `from` itself when there is none. */
export function nextInDirection(rects: readonly Rect[], from: number, dir: Direction): number {
  if (from < 0) return rects.length > 0 ? 0 : -1;
  const center = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const here = rects[from]!;
  const o = center(here);
  let best = from;
  let bestScore = Infinity;
  rects.forEach((rect, i) => {
    if (i === from) return;
    const c = center(rect);
    const dx = c.x - o.x;
    const dy = c.y - o.y;
    const along = dir === "down" ? dy : dir === "up" ? -dy : dir === "right" ? dx : -dx;
    // Overlapping across the move counts as aligned: a short item in a right-aligned list is not off to the side.
    const across =
      dir === "up" || dir === "down"
        ? rect.left < here.left + here.width && here.left < rect.left + rect.width ? 0 : Math.abs(dx)
        : rect.top < here.top + here.height && here.top < rect.top + rect.height ? 0 : Math.abs(dy);
    if (along <= 0) return;
    // Off-axis distance counts more, so aligned neighbours win.
    const score = along + across * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Layout box before CSS transforms: the phone's screen is tilted in 3D, and on-screen boxes would skew its rows. */
function layoutRect(e: HTMLElement): Rect {
  let left = 0;
  let top = 0;
  for (let n: Element | null = e; n instanceof HTMLElement; n = n.offsetParent) {
    left += n.offsetLeft;
    top += n.offsetTop;
  }
  for (let n = e.parentElement; n; n = n.parentElement) {
    left -= n.scrollLeft;
    top -= n.scrollTop;
  }
  return { left, top, width: e.offsetWidth, height: e.offsetHeight };
}

const FOCUSABLE =":is(button, input, select, [tabindex]):not([disabled]):not([tabindex='-1'])";

/**
 * Drives the focus inside `root` from the input's menu actions. `onCancel` is the screen's back
 * action; `onAction` gets the other actions (tabs, menu) first and returns true when it used them.
 */
export function menuNavigation(root: HTMLElement, input: Input, onCancel?: () => void, onAction?: (action: Action) => boolean) {
  const items = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.offsetParent !== null);
  const first = items()[0];
  if (!root.contains(document.activeElement)) first?.focus();
  return input.onAction((action) => {
    if (onAction?.(action)) return;
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    if (action === "up" || action === "down" || action === "left" || action === "right") {
      // Inside a text field the arrows move the caret.
      if (document.activeElement instanceof HTMLInputElement && (action === "left" || action === "right")) return;
      list[nextInDirection(list.map(layoutRect), at, action)]?.focus();
    } else if (action === "confirm") {
      // The input layer cancels the native Enter/Space click on bound keys, so this is the only click.
      if (document.activeElement instanceof HTMLInputElement) return;
      if (at >= 0) list[at]!.click();
    } else if (action === "cancel") {
      onCancel?.();
    }
  });
}
