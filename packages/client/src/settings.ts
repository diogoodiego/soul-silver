import { type AppSettings, DEFAULT_SETTINGS, type SettingsPatch } from "@soulsilver/shared";
import { get, writable } from "svelte/store";
import { audio } from "./audio";
import { input } from "./input/app-input";

/** The per-PC settings as last confirmed by the main process. */
export const settings = writable<AppSettings>(DEFAULT_SETTINGS);

function apply(next: AppSettings): void {
  settings.set(next);
  input.setBindings(next.bindings, next.pad);
  audio.setVolumes(next.audio);
  document.documentElement.style.setProperty("--ui-scale", String(next.uiScale));
}

export async function loadSettings(): Promise<void> {
  apply(await window.soulSilver.getSettings());
}

/** Resolves to false when the main process refused the patch. */
export async function saveSettings(patch: SettingsPatch): Promise<boolean> {
  const next = await window.soulSilver.setSettings(patch);
  apply(next);
  return Object.entries(patch).every(([k, v]) => JSON.stringify(next[k as keyof AppSettings]) === JSON.stringify(v));
}

export const currentSettings = () => get(settings);
