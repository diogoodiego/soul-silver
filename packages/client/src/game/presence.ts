import { t } from "../i18n";

/** What the server says a player is doing (spec 028.1), as text; undefined when they are free. */
export function presenceText(presence: unknown): string | undefined {
  return presence === "combat" || presence === "cutscene" || presence === "menu" ? t(`presence.${presence}`) : undefined;
}
