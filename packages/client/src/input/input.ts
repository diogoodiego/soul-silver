import type { MoveInput } from "@soulsilver/shared/game";

// Keyboard (8 directions) and gamepad (analog) to a movement vector (spec 011, research R12).
// The device used most recently wins.

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
    if (KEY_VECTORS[event.code] || RUN_KEYS.has(event.code)) {
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
    dispose(): void {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    },
  };
}
