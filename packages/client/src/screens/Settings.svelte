<script lang="ts">
  // Settings (spec 017, US7): window size, fullscreen, text speed, interface scale and controls;
  // audio volumes (spec 018). Each change is saved by the main process and applies at once.
  import { TEXT_SPEEDS, UI_SCALES, WINDOW_SIZES } from "@soulsilver/shared";
  import Confirm from "../Confirm.svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import { saveSettings, settings } from "../settings";

  // onRescue only in game: the title screen has nowhere to rescue from.
  let { onControls, onRescue, onBack }: { onControls: () => void; onRescue?: () => void; onBack: () => void } = $props();
  let askingRescue = $state(false);

  const VOLUMES = ["master", "music", "effects"] as const;
  /** Steps of 5 between 0 and 100. */
  function nudge(key: (typeof VOLUMES)[number], by: number): void {
    const audio = $settings.audio;
    void saveSettings({ audio: { ...audio, [key]: Math.max(0, Math.min(100, audio[key] + by)) } });
  }

</script>

<section use:menu={{ onBack }}>
  <h2>{t("settings.title")}</h2>

  <div class="flex flex-wrap items-center gap-2 mb-4" role="group" aria-labelledby="window-label">
    <span class="min-w-48" id="window-label">{t("settings.window")}</span>
    {#each WINDOW_SIZES as size (size.width)}
      <button type="button" class="aria-pressed:bg-accent aria-pressed:text-[#111]" aria-pressed={!$settings.fullscreen && $settings.window.width === size.width} onclick={() => void saveSettings({ window: { ...size }, fullscreen: false })}>{size.width}×{size.height}</button>
    {/each}
    <button type="button" class="aria-pressed:bg-accent aria-pressed:text-[#111]" aria-pressed={$settings.fullscreen} onclick={() => void saveSettings({ fullscreen: !$settings.fullscreen })}>{t("settings.fullscreen")}</button>
  </div>

  <div class="flex flex-wrap items-center gap-2 mb-4" role="group" aria-labelledby="speed-label">
    <span class="min-w-48" id="speed-label">{t("settings.textSpeed")}</span>
    {#each TEXT_SPEEDS as speed (speed)}
      <button type="button" class="aria-pressed:bg-accent aria-pressed:text-[#111]" aria-pressed={$settings.textSpeed === speed} onclick={() => void saveSettings({ textSpeed: speed })}>{t(`settings.speed.${speed}`)}</button>
    {/each}
  </div>

  <div class="flex flex-wrap items-center gap-2 mb-4">
    <button type="button" class="aria-pressed:bg-accent aria-pressed:text-[#111]" aria-pressed={$settings.fastCutsceneText} onclick={() => void saveSettings({ fastCutsceneText: !$settings.fastCutsceneText })}>{t("settings.fastCutsceneText")}</button>
  </div>

  <div class="flex flex-wrap items-center gap-2 mb-4" role="group" aria-labelledby="scale-label">
    <span class="min-w-48" id="scale-label">{t("settings.uiScale")}</span>
    {#each UI_SCALES as scale (scale)}
      <button type="button" class="aria-pressed:bg-accent aria-pressed:text-[#111]" aria-pressed={$settings.uiScale === scale} onclick={() => void saveSettings({ uiScale: scale })}>{Math.round(scale * 100)}%</button>
    {/each}
  </div>

  <div class="flex flex-wrap items-center gap-2 mb-4">
    <button type="button" class="aria-pressed:bg-accent aria-pressed:text-[#111]" aria-pressed={$settings.crt} onclick={() => void saveSettings({ crt: !$settings.crt })}>{t("settings.crt")}</button>
  </div>

  {#each VOLUMES as key (key)}
    <div class="flex flex-wrap items-center gap-2 mb-4" role="group" aria-labelledby="{key}-label">
      <span class="min-w-48" id="{key}-label">{t(`settings.audio.${key}`)}</span>
      <button type="button" aria-label={t("settings.audio.down", { label: t(`settings.audio.${key}`) })} onclick={() => nudge(key, -5)}>−</button>
      <output class="min-w-12 text-center">{$settings.audio[key]}%</output>
      <button type="button" aria-label={t("settings.audio.up", { label: t(`settings.audio.${key}`) })} onclick={() => nudge(key, 5)}>+</button>
    </div>
  {/each}

  <div class="flex flex-wrap items-center gap-2 mb-4">
    <button type="button" class="aria-pressed:bg-accent aria-pressed:text-[#111]" aria-pressed={$settings.audio.muteUnfocused} onclick={() => void saveSettings({ audio: { ...$settings.audio, muteUnfocused: !$settings.audio.muteUnfocused } })}>{t("settings.audio.muteUnfocused")}</button>
  </div>

  <div class="flex gap-2">
    <button type="button" onclick={onControls}>{t("settings.controls")}</button>
    {#if onRescue}<button type="button" onclick={() => (askingRescue = true)}>{t("settings.stuck")}</button>{/if}
    <button type="button" onclick={onBack}>{t("common.back")}</button>
  </div>
  {#if askingRescue}
    <Confirm question={t("settings.stuck.confirm")} onAnswer={(yes) => { askingRescue = false; if (yes) onRescue?.(); }} />
  {/if}
</section>
