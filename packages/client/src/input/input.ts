import { BUTTON, type MoveInput } from "@soulsilver/shared/game";

// Keyboard (8 directions) and gamepad (analog) to a movement vector (spec 011, research R12).
// The device used most recently wins. Moves 1–4 (spec 013): keys 1–4, or pad A, X, Y and RB;
// aim with the mouse pointer or the right stick. Companion actions (spec 014) come from ACTIONS.

export const STICK_DEADZONE = 0.2;

const KEY_VECTORS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};
const RUN_KEYS = new Set(["ShiftLeft", "ShiftRight"]);
/** Standard mapping: 1 is the right face button (B on Xbox, Circle on PlayStation). */
const RUN_BUTTON = 1;
const DPAD = { up: 12, down: 13, left: 14, right: 15 };
const MOVE_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4"];
const MOVE_BUTTONS = [0, 2, 3, 5];
/** Dash: Space, or pad LB. */
const DASH_KEY = "Space";
const DASH_BUTTON = 4;
export const DASH_BIT = BUTTON.dash;

/**
 * Companion and fight actions (spec 014): key code and standard-mapping pad button. The picker is
 * the client's own (it opens the quick swap); the others go to the server as input bits.
 * shortcut: fixed table, no remapping screen yet; add one that writes these to the settings when players ask.
 */
export const ACTIONS = {
  combat: { key: "KeyF", button: 6, bit: BUTTON.combat },
  recall: { key: "KeyR", button: 7, bit: BUTTON.recall },
  interact: { key: "KeyE", button: 8, bit: BUTTON.interact },
  picker: { key: "KeyQ", button: 9, bit: 0 },
  /** Spec 015: throw the selected ball toward the aim; cycle to the next ball in the bag (client only). */
  throw: { key: "KeyG", button: 10, bit: BUTTON.throw },
  nextBall: { key: "KeyB", button: 11, bit: 0 },
} as const;
const ACTION_KEYS: readonly string[] = Object.values(ACTIONS).map((a) => a.key);

/** Move slots held as bits 0–3, dash as bit 4, then the companion action bits. */
export function moveButtons(held: ReadonlySet<string>, padPressed: (button: number) => boolean): number {
  let bits = 0;
  for (let slot = 0; slot < 4; slot++) if (held.has(MOVE_KEYS[slot]!) || padPressed(MOVE_BUTTONS[slot]!)) bits |= 1 << slot;
  if (held.has(DASH_KEY) || padPressed(DASH_BUTTON)) bits |= DASH_BIT;
  for (const a of Object.values(ACTIONS)) if (held.has(a.key) || padPressed(a.button)) bits |= a.bit;
  return bits;
}

/** Held key codes to a vector of length 0 or 1. */
export function keyboardVector(held: ReadonlySet<string>): MoveInput["move"] {
  let x = 0;
  let y = 0;
  for (const code of held) {
    const v = KEY_VECTORS[code];
    if (v) {
      x += v[0];
      y += v[1];
    }
  }
  x = Math.sign(x);
  y = Math.sign(y);
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

export function createInput(target: Window) {
  const held = new Set<string>();
  let lastDevice: "keyboard" | "gamepad" = "keyboard";

  const onKeyDown = (event: KeyboardEvent) => {
    if (KEY_VECTORS[event.code] || RUN_KEYS.has(event.code) || MOVE_KEYS.includes(event.code) || event.code === DASH_KEY || ACTION_KEYS.includes(event.code)) {
      held.add(event.code);
      lastDevice = "keyboard";
      event.preventDefault();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  // Releasing keys while the window is in the background never fires keyup.
  const onBlur = () => held.clear();
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  /** Last pointer position in client pixels; aiming with it is up to the game screen. */
  let pointer: { x: number; y: number } | undefined;
  const onPointer = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    lastDevice = "keyboard";
  };
  target.addEventListener("pointermove", onPointer);

  function pad() {
    for (const p of target.navigator.getGamepads()) if (p?.connected) return p;
    return undefined;
  }

  function gamepad(): MoveInput | undefined {
    // Reconnected pads show up here again with no setup.
    for (const pad of target.navigator.getGamepads()) {
      if (!pad || !pad.connected) continue;
      const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;
      let move = stickVector(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      if (move.x === 0 && move.y === 0) {
        const dpad = new Set<string>();
        if (pressed(DPAD.up)) dpad.add("ArrowUp");
        if (pressed(DPAD.down)) dpad.add("ArrowDown");
        if (pressed(DPAD.left)) dpad.add("ArrowLeft");
        if (pressed(DPAD.right)) dpad.add("ArrowRight");
        move = keyboardVector(dpad);
      }
      const run = pressed(RUN_BUTTON);
      if (move.x !== 0 || move.y !== 0 || run) return { move, run };
    }
    return undefined;
  }

  return {
    /** Sampled once per tick. */
    read(): MoveInput {
      const pad = gamepad();
      const keys = { move: keyboardVector(held), run: [...RUN_KEYS].some((k) => held.has(k)) };
      const keysActive = keys.move.x !== 0 || keys.move.y !== 0;
      if (pad && !keysActive) lastDevice = "gamepad";
      return pad && lastDevice === "gamepad" ? pad : keys;
    },
    /** Moves held, as bits 0–3. */
    buttons(): number {
      const p = pad();
      return moveButtons(held, (i) => p?.buttons[i]?.pressed ?? false);
    },
    /** Whether an action's key or pad button is held. */
    held(action: keyof typeof ACTIONS): boolean {
      return held.has(ACTIONS[action].key) || (pad()?.buttons[ACTIONS[action].button]?.pressed ?? false);
    },
    /** Right-stick aim when it is pushed, else undefined. */
    stickAim(): MoveInput["move"] | undefined {
      const p = pad();
      const v = stickVector(p?.axes[2] ?? 0, p?.axes[3] ?? 0);
      if (v.x === 0 && v.y === 0) return undefined;
      lastDevice = "gamepad";
      return v;
    },
    /** The mouse pointer while the keyboard and mouse are in use. */
    pointer: () => (lastDevice === "keyboard" ? pointer : undefined),
    dispose(): void {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      target.removeEventListener("pointermove", onPointer);
    },
  };
}
