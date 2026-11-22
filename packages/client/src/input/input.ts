import { BUTTON, type MoveInput } from "@soulsilver/shared/game";
import { type Action, ACTIONS, type Bindings, DEFAULT_KEYS, PAD_BUTTONS, type PadBindings } from "@soulsilver/shared/input";
import { writable } from "svelte/store";

// Keyboard (8 directions) and gamepad (analog) to a movement vector (spec 011, research R12).
// The device used most recently wins. Keys come from the player's bindings (spec 017); pad buttons
// too (PAD_BUTTONS by default). Moves 1–4 (spec 013); nothing aims: the server aims every
// move and ball. Menus get discrete actions through onAction, with hold-to-repeat on the pad.

export const STICK_DEADZONE = 0.2;
const MOVE_ACTIONS = ["move1", "move2", "move3", "move4"] as const;
const ACTION_BITS = { dash: BUTTON.dash, guard: BUTTON.guard, combat: BUTTON.combat, recall: BUTTON.recall, interact: BUTTON.interact, throw: BUTTON.throw } as const;
export const DASH_BIT = BUTTON.dash;
/** Pad hold-to-repeat for menu actions: first repeat after REPEAT_DELAY_MS, then every REPEAT_EVERY_MS. */
export const REPEAT_DELAY_MS = 400;
export const REPEAT_EVERY_MS = 120;

export type Device = "keyboard" | "gamepad";
/** The device used last; button glyphs follow it. */
export const activeDevice = writable<Device>("keyboard");

const has = (held: ReadonlySet<string>, keys: readonly string[]) => keys.some((k) => held.has(k));

/** Move slots held as bits 0–3, dash as bit 4, then the companion action bits. */
export function moveButtons(held: ReadonlySet<string>, padPressed: (button: number) => boolean, bindings: Readonly<Bindings> = DEFAULT_KEYS, pad: Readonly<PadBindings> = PAD_BUTTONS): number {
  let bits = 0;
  MOVE_ACTIONS.forEach((a, slot) => {
    if (has(held, bindings[a]) || padPressed(pad[a])) bits |= 1 << slot;
  });
  for (const [a, bit] of Object.entries(ACTION_BITS) as [keyof typeof ACTION_BITS, number][]) if (has(held, bindings[a]) || padPressed(pad[a])) bits |= bit;
  return bits;
}

/** Held key codes to a vector of length 0 or 1. */
export function keyboardVector(held: ReadonlySet<string>, bindings: Readonly<Bindings> = DEFAULT_KEYS): MoveInput["move"] {
  const x = Math.sign((has(held, bindings.right) ? 1 : 0) - (has(held, bindings.left) ? 1 : 0));
  const y = Math.sign((has(held, bindings.down) ? 1 : 0) - (has(held, bindings.up) ? 1 : 0));
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

/** Stick axes to a vector: zero inside the dead zone, then rescaled from 0 to 1. */
export function stickVector(ax: number, ay: number): MoveInput["move"] {
  const length = Math.hypot(ax, ay);
  if (length <= STICK_DEADZONE) return { x: 0, y: 0 };
  const intensity = Math.min(1, (length - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  return { x: (ax / length) * intensity, y: (ay / length) * intensity };
}

/** Per-action press edges with hold-to-repeat: true when the action should fire now. */
export function createRepeater() {
  const since = new Map<Action, { down: number; next: number }>();
  return (action: Action, pressed: boolean, now: number): boolean => {
    const s = since.get(action);
    if (!pressed) {
      since.delete(action);
      return false;
    }
    if (!s) {
      since.set(action, { down: now, next: now + REPEAT_DELAY_MS });
      return true;
    }
    if (now < s.next) return false;
    s.next += REPEAT_EVERY_MS;
    if (s.next <= now) s.next = now + REPEAT_EVERY_MS;
    return true;
  };
}

/** Fed the pressed button each frame (-1: none): the first one pressed after a full release, once it is released too. */
export function createPadCapture() {
  let armed = false;
  let button = -1;
  return (down: number): number | undefined => {
    if (down < 0) {
      armed = true;
      return button < 0 ? undefined : button;
    }
    if (armed && button < 0) button = down;
    return undefined;
  };
}

/** Left stick as a menu direction, past half tilt. */
function stickDirection(ax: number, ay: number): Action | undefined {
  if (Math.hypot(ax, ay) < 0.5) return undefined;
  return Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? "right" : "left") : ay > 0 ? "down" : "up";
}

export function createInput(target: Window, initial: Readonly<Bindings> = DEFAULT_KEYS) {
  let bindings = initial;
  let padButtons: Readonly<PadBindings> = PAD_BUTTONS;
  let capture: { step: ReturnType<typeof createPadCapture>; done: (button: number) => void } | undefined;
  const held = new Set<string>();
  let lastDevice: Device = "keyboard";
  const use = (device: Device) => {
    if (device === lastDevice) return;
    lastDevice = device;
    activeDevice.set(device);
  };
  activeDevice.set(lastDevice);
  const listeners = new Set<(action: Action) => void>();
  const emit = (action: Action) => {
    for (const l of listeners) l(action);
  };
  const bound = (code: string) => ACTIONS.filter((a) => bindings[a].includes(code));

  const onKeyDown = (event: KeyboardEvent) => {
    const actions = bound(event.code);
    if (actions.length === 0) return;
    use("keyboard");
    // Text fields keep their own keys (Backspace deletes, Enter submits, letters do not walk); only Escape leaves them.
    if (event.target instanceof HTMLInputElement) {
      if (event.code === "Escape") emit("cancel");
      return;
    }
    held.add(event.code);
    event.preventDefault();
    for (const a of actions) emit(a);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  // Releasing keys while the window is in the background never fires keyup.
  const onBlur = () => held.clear();
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  /** The mouse only tells that keyboard and mouse are in use: nothing aims with it. */
  const onPointer = () => use("keyboard");
  target.addEventListener("pointermove", onPointer);
  target.addEventListener("pointerdown", onPointer);

  // Reconnected pads show up here again with no setup.
  function pad() {
    for (const p of target.navigator.getGamepads()) if (p?.connected) return p;
    return undefined;
  }
  const pressed = (button: number) => pad()?.buttons[button]?.pressed ?? false;

  const repeat = createRepeater();
  let poll = target.requestAnimationFrame(function frame(now) {
    const p = pad();
    if (capture) {
      // The button is being chosen, not used.
      const button = capture.step(p ? p.buttons.findIndex((b, i) => i <= 15 && b.pressed) : -1);
      if (button !== undefined) {
        const { done } = capture;
        capture = undefined;
        done(button);
      }
      poll = target.requestAnimationFrame(frame);
      return;
    }
    const dir = p ? stickDirection(p.axes[0] ?? 0, p.axes[1] ?? 0) : undefined;
    for (const a of ACTIONS) {
      const down = p !== undefined && ((p.buttons[padButtons[a]]?.pressed ?? false) || a === dir);
      if (repeat(a, down, now)) {
        use("gamepad");
        emit(a);
      }
    }
    poll = target.requestAnimationFrame(frame);
  });

  function gamepad(): MoveInput | undefined {
    const p = pad();
    if (!p) return undefined;
    // On the map only the left stick moves; the D-pad is for the ball and item cycles and the swap.
    const move = stickVector(p.axes[0] ?? 0, p.axes[1] ?? 0);
    const run = pressed(padButtons.run);
    return move.x !== 0 || move.y !== 0 || run ? { move, run } : undefined;
  }

  return {
    /** Sampled once per tick. */
    read(): MoveInput {
      const p = gamepad();
      const keys = { move: keyboardVector(held, bindings), run: has(held, bindings.run) };
      const keysActive = keys.move.x !== 0 || keys.move.y !== 0;
      if (p && !keysActive) use("gamepad");
      return p && lastDevice === "gamepad" ? p : keys;
    },
    /** Moves held, as bits 0–3, and the action bits. */
    buttons(): number {
      return moveButtons(held, pressed, bindings, padButtons);
    },
    /** Whether an action's key or pad button is held. */
    held(action: Action): boolean {
      return has(held, bindings[action]) || pressed(padButtons[action]);
    },
    /** Discrete actions for menus; returns a function that cancels the subscription. */
    onAction(listener: (action: Action) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The next pad button pressed goes to `done` instead of acting; returns a function that cancels. */
    capturePad(done: (button: number) => void): () => void {
      capture = { step: createPadCapture(), done };
      return () => {
        capture = undefined;
      };
    },
    setBindings(next: Readonly<Bindings>, nextPad: Readonly<PadBindings>): void {
      bindings = next;
      padButtons = nextPad;
      held.clear();
    },
    dispose(): void {
      target.cancelAnimationFrame(poll);
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      target.removeEventListener("pointermove", onPointer);
      target.removeEventListener("pointerdown", onPointer);
    },
  };
}

export type Input = ReturnType<typeof createInput>;
