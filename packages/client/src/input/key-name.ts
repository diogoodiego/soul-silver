import { t } from "../i18n";

/** KeyboardEvent.code to a short label for the screen. */
export function keyName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const NAMES: Record<string, string> = { Space: t("key.space"), Enter: "Enter", Escape: "Esc", Backspace: "⌫", Tab: "Tab", ShiftLeft: "Shift", ShiftRight: "Shift", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return NAMES[code] ?? code;
}
