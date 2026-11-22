import { z } from "zod";
import { PLAYER_NAME_MAX } from "./game/limits";
import { ACTIONS, DEFAULT_KEYS, PAD_BUTTONS, RESERVED_KEYS, type Bindings } from "./input/bindings";

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
/** How much faster script text types with fastCutsceneText on. */
export const CUTSCENE_TEXT_BOOST = 2;
export const UI_SCALES = [0.75, 1, 1.25, 1.5] as const;
/** V.1: post-processing cost; "off" keeps the plain upscaled canvas. */
export const VISUAL_QUALITIES = ["off", "low", "high"] as const;
export type VisualQuality = (typeof VISUAL_QUALITIES)[number];
export const VISUAL_EFFECTS = ["tiltShift", "bloom", "vignette", "fog", "shadows", "godRays", "clouds"] as const;
const VISUAL_DEFAULTS = { quality: "low", tiltShift: 50, bloom: 40, vignette: 50, fog: 40, shadows: 50, godRays: 50, clouds: 50 } as const;

const windowSize = z.strictObject({ width: z.number(), height: z.number() }).refine((w) => WINDOW_SIZES.some((s) => s.width === w.width && s.height === w.height), "tamanho de janela fora da lista");
const keys = z.array(z.string().min(1).refine((k) => !RESERVED_KEYS.has(k), "tecla reservada")).min(1);
const volume = z.number().int().min(0).max(100).multipleOf(5);
/** Bloom's scale is a tenth of the old one (100 now = 10 then), so it takes steps of 1. */
export const STEP_1_EFFECTS: readonly (typeof VISUAL_EFFECTS)[number][] = ["bloom"];
const fine = z.number().int().min(0).max(100);
// An effect added later takes its default, as bindings do; 0 turns an effect off.
const visual = z.strictObject({
  quality: z.enum(VISUAL_QUALITIES).default(VISUAL_DEFAULTS.quality),
  ...(Object.fromEntries(VISUAL_EFFECTS.map((e) => [e, (STEP_1_EFFECTS.includes(e) ? fine : volume).default(VISUAL_DEFAULTS[e])])) as Record<(typeof VISUAL_EFFECTS)[number], z.ZodDefault<typeof fine>>),
});
// An action added later takes its default key, so older settings keep their bindings.
const bindings = z.strictObject(Object.fromEntries(ACTIONS.map((a) => [a, keys.default(() => [...DEFAULT_KEYS[a]])])) as Record<keyof Bindings, z.ZodDefault<typeof keys>>);
// Standard Gamepad buttons, D-pad included.
const button = z.number().int().min(0).max(15);
const pad = z.strictObject(Object.fromEntries(ACTIONS.map((a) => [a, button.default(PAD_BUTTONS[a])])) as Record<keyof Bindings, z.ZodDefault<typeof button>>);

/** A team member in the arena's menu: its 4 move slots (block C), 0 for an empty one. */
const arenaTeam = z.array(z.strictObject({ species: z.number().int().min(1), level: z.number().int().min(1).max(100), moves: z.array(z.number().int().min(0)).length(4) })).min(1).max(6);
const arena = z.strictObject({
  name: z.string().min(1).max(PLAYER_NAME_MAX),
  character: z.enum(["male", "female"]),
  mine: arenaTeam,
  foeKind: z.enum(["wild", "trainer"]),
  behavior: z.enum(["ai", "idle"]),
  trainerId: z.number().int().min(1),
  theirs: arenaTeam,
  /** Absent: the open field. */
  ring: z.number().int().min(0).optional(),
  /** Absent: no Gym Leader. */
  leader: z.number().int().min(1).optional(),
  /** Absent: no legendary. */
  legendary: z.number().int().min(1).optional(),
});

const fields = {
  firewallNoticeSeen: z.boolean(),
  window: windowSize,
  fullscreen: z.boolean(),
  textSpeed: z.enum(TEXT_SPEEDS),
  /** Spec 021: script text types this many times faster than textSpeed. */
  fastCutsceneText: z.boolean(),
  uiScale: z.number().refine((n) => (UI_SCALES as readonly number[]).includes(n), "escala fora da lista"),
  /** Scanlines over the game screen and the team panel. */
  crt: z.boolean(),
  /** Ordered dither over the Pokédex screen (settings and phone). */
  dither: z.boolean(),
  /** V.1: HD-2D post-processing over the field. */
  visual,
  bindings,
  pad,
  /** Spec 018: volumes 0–100 in steps of 5. */
  audio: z.strictObject({ master: volume, music: volume, effects: volume, muteUnfocused: z.boolean() }),
  /** R.1: what guests must type to join a session this PC hosts; empty means no password. */
  roomPassword: z.string().max(64),
  /** R.3: where invites learn this PC's public address; empty sends none (only LAN and IPv6 candidates). */
  stunServer: z.string().max(200).regex(/^(stuns?:\S+)?$/, "use stun: ou stuns:"),
  /** The test arena's menu as it was left; null before the first time. */
  arena: arena.nullable(),
};

export type AppSettings = { [K in keyof typeof fields]: z.infer<(typeof fields)[K]> };

export const DEFAULT_SETTINGS: AppSettings = {
  firewallNoticeSeen: false,
  window: { ...WINDOW_SIZES[0] },
  fullscreen: false,
  textSpeed: "mid",
  fastCutsceneText: false,
  uiScale: 1,
  crt: true,
  dither: true,
  visual: { ...VISUAL_DEFAULTS },
  bindings: structuredClone(DEFAULT_KEYS),
  pad: { ...PAD_BUTTONS },
  audio: { master: 80, music: 80, effects: 80, muteUnfocused: false },
  roomPassword: "",
  stunServer: "stun:stun.l.google.com:19302",
  arena: null,
};

/** Any JSON to full settings, field by field. */
export function readSettings(raw: unknown): AppSettings {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const key of Object.keys(fields) as (keyof AppSettings)[]) {
    const parsed = fields[key].safeParse(obj[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  // E became the next-Pokémon key: settings from before it that still interact on E interact on Space now.
  const saved = obj["bindings"];
  if (typeof saved === "object" && saved !== null && !("swapNext" in saved) && out.bindings.interact.length === 1 && out.bindings.interact[0] === "KeyE") out.bindings.interact = [...DEFAULT_KEYS.interact];
  // Block H moved the moves from 1–4 to J/K/L/I: settings still on the whole old set take the new keys.
  const MOVES = ["move1", "move2", "move3", "move4"] as const;
  if (MOVES.every((a, i) => out.bindings[a].length === 1 && out.bindings[a][0] === `Digit${i + 1}`)) for (const a of MOVES) out.bindings[a] = [...DEFAULT_KEYS[a]];
  // One key, one job: Escape used to open the menu too, so backing out of a screen opened the phone.
  const { menu, cancel } = out.bindings;
  if (cancel.includes("Escape") && menu.includes("Escape")) {
    const rest = menu.filter((k) => k !== "Escape");
    out.bindings.menu = rest.length > 0 ? rest : [...DEFAULT_KEYS.menu];
  }
  return out;
}

/** A patch from the renderer; undefined when any field is invalid (the old settings stay). */
export const settingsPatch = z.strictObject(fields).partial();
export type SettingsPatch = z.infer<typeof settingsPatch>;
