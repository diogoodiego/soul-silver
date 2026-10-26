import type { Action } from "@soulsilver/shared/input";
import { audio } from "../audio";
import { input } from "./app-input";
import { menuNavigation } from "./focus";

// Svelte action for a menu screen. Menus stack: only the one mounted last gets the pad and keys.

export interface MenuOptions {
  onBack?: (() => void) | undefined;
  /** Gets every action first (tabs, menu); returns true when it used it. */
  onAction?: ((action: Action) => boolean) | undefined;
}

const stack: symbol[] = [];

/** Spec 018: cursor, confirm and cancel sounds. */
const SOUNDS: Partial<Record<Action, string>> = { up: "menu-cursor", down: "menu-cursor", left: "menu-cursor", right: "menu-cursor", confirm: "menu-confirm", cancel: "menu-cancel" };

export function menu(node: HTMLElement, options: MenuOptions = {}) {
  const id = Symbol("menu");
  stack.push(id);
  let current = options;
  const off = menuNavigation(
    node,
    input,
    () => current.onBack?.(),
    (action) => {
      if (stack.at(-1) !== id) return true;
      if (current.onAction?.(action)) return true;
      const cue = SOUNDS[action];
      if (cue) void audio.play(cue, { source: "ui", kind: "effect" });
      return false;
    },
  );
  return {
    update(next: MenuOptions) {
      current = next;
    },
    destroy() {
      off();
      stack.splice(stack.indexOf(id), 1);
    },
  };
}
