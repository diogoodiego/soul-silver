import { z } from "zod";
import { ACTIONS, DEFAULT_KEYS, RESERVED_KEYS, type Bindings } from "./input/bindings";

// Per-PC settings (spec 017, data-model.md). The file never blocks startup: a missing or
// invalid field falls back to its default on its own.

export const WINDOW_SIZES = [
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 },
] as const;
export const TEXT_SPEEDS = ["slow", "mid", "fast"] as const;
export type TextSpeed = (typeof TEXT_SPEEDS)[number];
/** Frames per character at 60 fps, as in the original. */
export const TEXT_FRAMES_PER_CHAR: Record<TextSpeed, number> = { slow: 8, mid: 4, fast: 1 };
export const UI_SCALES = [0.75, 1, 1.25, 1.5] as const;

const windowSize = z.strictObject({ width: z.number(), height: z.number() }).refine((w) => WINDOW_SIZES.some((s) => s.width === w.width && s.height === w.height), "tamanho de janela fora da lista");
const keys = z.array(z.string().min(1).refine((k) => !RESERVED_KEYS.has(k), "tecla reservada")).min(1);
const volume = z.number().int().min(0).max(100).multipleOf(5);
const bindings = z.strictObject(Object.fromEntries(ACTIONS.map((a) => [a, keys])) as Record<keyof Bindings, typeof keys>);

const fields = {
  firewallNoticeSeen: z.boolean(),
  window: windowSize,
  fullscreen: z.boolean(),
  textSpeed: z.enum(TEXT_SPEEDS),
  uiScale: z.number().refine((n) => (UI_SCALES as readonly number[]).includes(n), "escala fora da lista"),
  bindings,
  /** Spec 018: volumes 0–100 in steps of 5. */
  audio: z.strictObject({ master: volume, music: volume, effects: volume, muteUnfocused: z.boolean() }),
};

export type AppSettings = { [K in keyof typeof fields]: z.infer<(typeof fields)[K]> };

export const DEFAULT_SETTINGS: AppSettings = {
  firewallNoticeSeen: false,
  window: { ...WINDOW_SIZES[0] },
  fullscreen: false,
  textSpeed: "mid",
  uiScale: 1,
  bindings: structuredClone(DEFAULT_KEYS),
  audio: { master: 80, music: 80, effects: 80, muteUnfocused: false },
};

/** Any JSON to full settings, field by field. */
export function readSettings(raw: unknown): AppSettings {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const key of Object.keys(fields) as (keyof AppSettings)[]) {
    const parsed = fields[key].safeParse(obj[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  return out;
}

/** A patch from the renderer; undefined when any field is invalid (the old settings stay). */
export const settingsPatch = z.strictObject(fields).partial();
export type SettingsPatch = z.infer<typeof settingsPatch>;
