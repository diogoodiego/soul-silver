import type { Entity, HitEvent } from "@soulsilver/shared/game";
import { formatText, parseTextFile, screenText, type TextBankFile } from "@soulsilver/shared/text";

// Hit feedback (spec 013, US2): damage numbers and the effectiveness texts over the target. The
// texts are the game's own battle messages, read from the extracted text catalog.

const BATTLE_BANK = 197;
const SPECIES_BANK = 237;
const TEXT = { superEffective: 780, notVeryEffective: 779, critical: 774, noEffect: 27 } as const;
const LIFE_MS = 900;
const RISE_PX = 24;

export interface FeedbackLine {
  text: string;
  tone: "damage" | "heal" | "super" | "weak" | "none" | "crit";
}

export interface FeedbackTexts {
  battle(id: number): string | undefined;
  species(id: number): string | undefined;
}

/** What to show for one event; the texts fall back to nothing when the catalog is missing. */
export function feedbackLines(e: HitEvent, texts: FeedbackTexts, targetSpecies: number | undefined): FeedbackLine[] {
  const lines: FeedbackLine[] = [];
  const add = (text: string | undefined, tone: FeedbackLine["tone"]) => {
    if (text) lines.push({ text, tone });
  };
  switch (e.kind) {
    case "immune": {
      const raw = texts.battle(TEXT.noEffect);
      const name = targetSpecies === undefined ? undefined : texts.species(targetSpecies);
      add(raw && name ? screenText(formatText(raw, { "pokemon-name:0": name })) : undefined, "none");
      break;
    }
    case "hit":
      add(String(e.amount), "damage");
      if (e.crit) add(texts.battle(TEXT.critical), "crit");
      if (e.effectiveness > 1) add(texts.battle(TEXT.superEffective), "super");
      else if (e.effectiveness > 0 && e.effectiveness < 1) add(texts.battle(TEXT.notVeryEffective), "weak");
      break;
    case "tick":
      add(String(e.amount), "damage");
      break;
    case "heal":
      if (e.amount > 0) add(`+${e.amount}`, "heal");
      break;
    default:
      break;
  }
  return lines.map((l) => ({ ...l, text: l.tone === "damage" || l.tone === "heal" ? l.text : screenText(l.text) }));
}

async function loadBank(bank: number): Promise<TextBankFile | undefined> {
  const file = `${String(bank).padStart(4, "0")}.json`;
  try {
    const response = await fetch(`assets://stages/text-catalog/catalog/en/${file}`);
    if (!response.ok) return undefined;
    const parsed = parseTextFile("text-bank", await response.json(), file);
    return parsed.ok ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const COLORS: Record<FeedbackLine["tone"], string> = { damage: "#fff", heal: "#7f7", super: "#fc4", weak: "#9cf", none: "#ccc", crit: "#f88" };

export function createCombatFx(host: HTMLElement, project: (x: number, y: number) => { x: number; y: number }, log: (message: string) => void) {
  const layer = document.createElement("div");
  layer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;font:bold 14px system-ui,sans-serif;text-shadow:0 1px 2px #000";
  host.append(layer);
  let battle: TextBankFile | undefined;
  let species: TextBankFile | undefined;
  void Promise.all([loadBank(BATTLE_BANK), loadBank(SPECIES_BANK)]).then(([b, s]) => {
    battle = b;
    species = s;
    if (!b || !s) log("Battle texts missing; showing damage numbers only");
  });
  const texts: FeedbackTexts = {
    battle: (id) => battle?.records.find((r) => r.id === id)?.text,
    species: (id) => species?.records.find((r) => r.id === id)?.text,
  };
  const labels: { el: HTMLDivElement; x: number; y: number; start: number }[] = [];

  return {
    show(events: HitEvent[], entity: (id: number) => Entity | undefined, now: number): void {
      for (const e of events) {
        const target = entity(e.target);
        if (!target) continue;
        const species = typeof target.data["species"] === "number" ? target.data["species"] : undefined;
        feedbackLines(e, texts, species).forEach((line, i) => {
          const el = document.createElement("div");
          el.textContent = line.text;
          el.style.cssText = `position:absolute;white-space:nowrap;transform:translate(-50%,-100%);color:${COLORS[line.tone]}`;
          layer.append(el);
          labels.push({ el, x: target.x, y: target.y - 32 - i * 12, start: now });
        });
      }
    },
    /** Once per frame, after the renderer has placed the camera. */
    update(now: number): void {
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i]!;
        const k = (now - l.start) / LIFE_MS;
        if (k >= 1) {
          l.el.remove();
          labels.splice(i, 1);
          continue;
        }
        const p = project(l.x, l.y);
        l.el.style.left = `${p.x}px`;
        l.el.style.top = `${p.y - k * RISE_PX}px`;
        l.el.style.opacity = String(1 - k * k);
      }
    },
    destroy(): void {
      layer.remove();
    },
  };
}
