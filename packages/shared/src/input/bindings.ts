// Logical actions and their keyboard and gamepad buttons (spec 017, research R3,
// contracts/ui-actions.md). Keys are KeyboardEvent.code values; pad buttons are Standard Gamepad
// (Xbox layout) indices and are not remappable.

export const DIRECTIONS = ["up", "down", "left", "right"] as const;
const MENU_ACTIONS = ["confirm", "cancel", "tabPrev", "tabNext"] as const;
const MAP_ACTIONS = ["menu", "run", "dash", "move1", "move2", "move3", "move4", "combat", "recall", "interact", "picker", "swapNext", "throw", "nextBall", "rod", "items"] as const;
/** Map actions that only act out of combat, and ones that only act in it: one key may serve one of each. */
const FIELD_ONLY: readonly string[] = ["interact"];
const COMBAT_ONLY: readonly string[] = ["dash", "move1", "move2", "move3", "move4"];

export const ACTIONS = [...DIRECTIONS, ...MENU_ACTIONS, ...MAP_ACTIONS] as const;
export type Action = (typeof ACTIONS)[number];
export type Bindings = Record<Action, string[]>;

/** A key may mean one thing on the map and another in menus; directions mean the same in both. */
export function sameContext(a: Action, b: Action): boolean {
  const context = (x: Action) => ((DIRECTIONS as readonly string[]).includes(x) ? "both" : (MENU_ACTIONS as readonly string[]).includes(x) ? "menu" : "map");
  const ca = context(a);
  const cb = context(b);
  if ((FIELD_ONLY.includes(a) && COMBAT_ONLY.includes(b)) || (COMBAT_ONLY.includes(a) && FIELD_ONLY.includes(b))) return false;
  return ca === "both" || cb === "both" || ca === cb;
}

export const DEFAULT_KEYS: Readonly<Bindings> = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  confirm: ["Enter", "Space"],
  cancel: ["Escape", "Backspace"],
  tabPrev: ["KeyQ"],
  tabNext: ["KeyE"],
  menu: ["Tab", "Escape"],
  run: ["ShiftLeft", "ShiftRight"],
  dash: ["Space"],
  move1: ["KeyJ"],
  move2: ["KeyK"],
  move3: ["KeyL"],
  move4: ["KeyI"],
  combat: ["KeyF"],
  recall: ["KeyR"],
  /** Out of combat only, so it shares Space with the dodge (dash), which acts only in combat. */
  interact: ["Space"],
  /** The previous Pokémon (in combat sent out, on the field rotated to lead); the swap picker opens on a faint. */
  picker: ["KeyQ"],
  swapNext: ["KeyE"],
  throw: ["KeyG"],
  nextBall: ["KeyB"],
  rod: ["KeyC"],
  items: ["KeyO"],
};

export const PAD_BUTTONS: Readonly<Record<Action, number>> = {
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  confirm: 0,
  cancel: 1,
  tabPrev: 4,
  tabNext: 5,
  menu: 9,
  run: 1,
  dash: 4,
  move1: 0,
  move2: 2,
  move3: 3,
  move4: 5,
  combat: 6,
  recall: 7,
  /** A, with move 1: the server reads interact only walking and the moves only in combat. */
  interact: 0,
  picker: 8,
  /** D-pad down: free on the map, where the left stick walks. */
  swapNext: 13,
  throw: 10,
  nextBall: 15,
  rod: 11,
  /** Spec 027: the quick item selector in combat, on the D-pad like nextBall; tap cycles, hold uses. */
  items: 14,
};

/** Keys the OS or the app keeps for itself (fullscreen, close window, Start menu). */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(["F11", "F4", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "ContextMenu"]);

/**
 * Binds `action` to `key` alone. When another action of the same context already uses the key,
 * that action gets `action`'s previous first key instead, and is returned as `swapped`.
 */
export function rebind(bindings: Readonly<Bindings>, action: Action, key: string): { bindings: Bindings; swapped?: Action } {
  if (RESERVED_KEYS.has(key)) throw new Error(`reserved key: ${key}`);
  const next = structuredClone(bindings) as Bindings;
  const old = next[action][0];
  next[action] = [key];
  const other = ACTIONS.find((a) => a !== action && sameContext(a, action) && next[a].includes(key));
  if (!other) return { bindings: next };
  next[other] = next[other].map((k) => (k === key ? old : k)).filter((k): k is string => k !== undefined && k !== key);
  return { bindings: next, swapped: other };
}
