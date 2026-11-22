import { t } from "../i18n";

const PAD_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Start", "LS", "RS", "↑", "↓", "←", "→"];

/** Standard Gamepad button to its Xbox name. */
export const padName = (button: number): string => PAD_NAMES[button] ?? String(button);

/** KeyboardEvent.code to a short label for the screen. */
export function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const NAMES: Record<string, string> = { Space: t("key.space"), Enter: "Enter", Escape: "Esc", Backspace: "⌫", Tab: "Tab", ShiftLeft: "Shift", ShiftRight: "Shift", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return NAMES[code] ?? code;
}
