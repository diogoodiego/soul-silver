// Logical actions and their keyboard and gamepad buttons (spec 017, research R3,
// contracts/ui-actions.md). Keys are KeyboardEvent.code values; pad buttons are Standard Gamepad
// (Xbox layout) indices; the directions are not remappable.

export const DIRECTIONS = ["up", "down", "left", "right"] as const;
const MENU_ACTIONS = ["confirm", "cancel", "tabPrev", "tabNext"] as const;
const MAP_ACTIONS = ["menu", "run", "dash", "guard", "move1", "move2", "move3", "move4", "combat", "recall", "interact", "picker", "swapNext", "throw", "nextBall", "rod", "items"] as const;
/** Map actions that only act out of combat, and ones that only act in it: one key may serve one of each. */
const FIELD_ONLY: readonly string[] = ["interact", "run"];
const COMBAT_ONLY: readonly string[] = ["dash", "guard", "move1", "move2", "move3", "move4"];

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
  menu: ["Tab"],
  run: ["ShiftLeft", "ShiftRight"],
  dash: ["Space"],
  /** Block C: tap to parry, hold to guard; pressed while a move charges, a feint. */
  guard: ["KeyH"],
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

export type PadBindings = Record<Action, number>;

export const PAD_BUTTONS: Readonly<PadBindings> = {
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
  /** The moves HUD: A dodges, B blocks, X/Y the two skills, RB/RT the two specials. */
  dash: 0,
  /** Block C: B, which only runs on the map (running does nothing in combat). */
  guard: 1,
  move1: 2,
  move2: 3,
  move3: 5,
  move4: 7,
  combat: 6,
  recall: 4,
  /** A, with the dodge: the server reads interact only walking and the moves only in combat. */
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

const isDirection = (action: Action) => (DIRECTIONS as readonly string[]).includes(action);
/** Actions whose pad button the player may change: the D-pad always navigates menus. */
export const PAD_ACTIONS = ACTIONS.filter((a) => !isDirection(a));

/**
 * Moves `action` to a pad button. Actions it clashes with there take its old button, those that clash
 * with them on it come to the new one, and so on. Throws for a direction, or a menu action on the D-pad.
 */
export function rebindPad(pad: Readonly<PadBindings>, action: Action, button: number): { pad: PadBindings; swapped: Action[] } {
  const dpad = button >= PAD_BUTTONS.up && button <= PAD_BUTTONS.right;
  if (isDirection(action) || (dpad && (MENU_ACTIONS as readonly string[]).includes(action))) throw new Error(`reserved button: ${button}`);
  const old = pad[action];
  const moved = new Set<Action>([action]);
  // A set may grow while it is iterated, so this walks the whole chain of clashes.
  for (const m of moved) for (const a of PAD_ACTIONS) if ((pad[a] === old || pad[a] === button) && pad[a] !== pad[m] && sameContext(a, m)) moved.add(a);
  const next = { ...pad };
  for (const m of moved) next[m] = pad[m] === old ? button : old;
  moved.delete(action);
  return { pad: next, swapped: [...moved] };
}

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
