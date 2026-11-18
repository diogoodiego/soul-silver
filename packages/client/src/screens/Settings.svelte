<script lang="ts">
  // Settings (spec 017, US7; audio spec 018) on a 3D Pokédex: four tabs on its screen, LB/RB between them,
  // left/right change the focused option. Each change is saved by the main process and applies at once.
  import { STEP_1_EFFECTS, TEXT_SPEEDS, UI_SCALES, VISUAL_EFFECTS, VISUAL_QUALITIES, WINDOW_SIZES } from "@soulsilver/shared";
  import { type Action, ACTIONS, PAD_BUTTONS } from "@soulsilver/shared/input";
  import { onMount, tick } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import { createPokedex, DEX_SCREEN_H, DEX_SCREEN_W, DEX_STRIP_H, DEX_STRIP_LEFT } from "../render/pokedex-model";
  import { saveSettings, settings } from "../settings";
  import Confirm from "../ui/Confirm.svelte";
  import DexRow from "../ui/DexRow.svelte";
  import Glyph from "../ui/Glyph.svelte";
  import GamepadFigure from "../ui/GamepadFigure.svelte";
  import KeyHints from "../ui/KeyHints.svelte";
  import Controls from "./Controls.svelte";

  // onRescue only in game: the title screen has nowhere to rescue from.
  let { onRescue, onBack }: { onRescue?: () => void; onBack: () => void } = $props();

  const TABS = ["game", "audio", "video", "gamepad", "controls", "accessibility"] as const;
  type Tab = (typeof TABS)[number];
  let tab = $state<Tab>("game");
  /** The focused row's id, for the note at the bottom of the screen. */
  let focused = $state<string | undefined>();
  let askingRescue = $state(false);
  /** The controls tab: the action waiting for its new key, and its outcome. */
  let waiting = $state<Action | undefined>();
  let controlsMessage = $state<string | undefined>();

  let host: HTMLDivElement;
  let screen: HTMLDivElement;
  let list: HTMLDivElement;
  onMount(() => createPokedex(host, screen));

  interface Row {
    id: string;
    label: string;
    value: string;
    /** Left (-1) and right (1); a click steps forward. */
    adjust?: (by: -1 | 1) => void;
    /** Confirm, when it is not a step forward. */
    activate?: () => void;
  }

  function choice<T>(id: string, label: string, options: readonly T[], current: T, name: (option: T) => string, apply: (option: T) => void): Row {
    const at = Math.max(0, options.indexOf(current));
    return { id, label, value: `< ${name(current)} >`, adjust: (by) => apply(options[(at + by + options.length) % options.length]!) };
  }
  function toggle(id: string, label: string, on: boolean, apply: (on: boolean) => void): Row {
    return { id, label, value: on ? `[x] ${t("settings.on")}` : `[ ] ${t("settings.off")}`, adjust: () => apply(!on) };
  }
  /** 0–100 in steps of `step` (5 by default), drawn as a 10-cell bar. */
  function slider(id: string, label: string, value: number, apply: (value: number) => void, step = 5): Row {
    const cells = Math.round(value / 10);
    return { id, label, value: `[${"#".repeat(cells)}${"-".repeat(10 - cells)}] ${value}%`, adjust: (by) => apply(Math.max(0, Math.min(100, value + by * step))) };
  }

  const FULLSCREEN = "fullscreen";
  const rows = $derived.by((): Row[] => {
    const s = $settings;
    switch (tab) {
      case "game":
        return [
          choice("textSpeed", t("settings.textSpeed"), TEXT_SPEEDS, s.textSpeed, (v) => t(`settings.speed.${v}`), (textSpeed) => void saveSettings({ textSpeed })),
          toggle("fastCutsceneText", t("settings.fastCutsceneText"), s.fastCutsceneText, (fastCutsceneText) => void saveSettings({ fastCutsceneText })),
          ...(onRescue ? [{ id: "stuck", label: t("settings.stuck"), value: "", activate: () => (askingRescue = true) }] : []),
        ];
      case "audio":
        return [
          ...(["master", "music", "effects"] as const).map((key) => slider(key, t(`settings.audio.${key}`), s.audio[key], (v) => void saveSettings({ audio: { ...s.audio, [key]: v } }))),
          toggle("muteUnfocused", t("settings.audio.muteUnfocused"), s.audio.muteUnfocused, (muteUnfocused) => void saveSettings({ audio: { ...s.audio, muteUnfocused } })),
        ];
      case "video": {
        const sizes = [...WINDOW_SIZES.map((w) => w.width), FULLSCREEN] as const;
        return [
          choice("window", t("settings.window"), sizes, s.fullscreen ? FULLSCREEN : s.window.width, (v) => (v === FULLSCREEN ? t("settings.fullscreen") : `${v}×${WINDOW_SIZES.find((w) => w.width === v)!.height}`), (v) =>
            void saveSettings(v === FULLSCREEN ? { fullscreen: true } : { window: { ...WINDOW_SIZES.find((w) => w.width === v)! }, fullscreen: false }),
          ),
          toggle("crt", t("settings.crt"), s.crt, (crt) => void saveSettings({ crt })),
          choice("quality", t("settings.visual.quality"), VISUAL_QUALITIES, s.visual.quality, (v) => t(`settings.visual.quality.${v}`), (quality) => void saveSettings({ visual: { ...s.visual, quality } })),
          ...(s.visual.quality === "off" ? [] : VISUAL_EFFECTS.map((key) => slider(key, t(`settings.visual.${key}`), s.visual[key], (v) => void saveSettings({ visual: { ...s.visual, [key]: v } }), STEP_1_EFFECTS.includes(key) ? 1 : 5))),
        ];
      }
      case "gamepad":
      case "controls":
        return [];
      case "accessibility":
        return [choice("uiScale", t("settings.uiScale"), UI_SCALES, s.uiScale, (v) => `${Math.round(v * 100)}%`, (uiScale) => void saveSettings({ uiScale }))];
    }
  });

  const note = $derived.by(() => {
    if (tab === "controls" && (controlsMessage || focused?.startsWith("action."))) return controlsMessage ?? t("controls.hint");
    return focused ? t(`settings.note.${focused}` as Parameters<typeof t>[0]) : "";
  });

  async function showTab(next: Tab): Promise<void> {
    tab = next;
    focused = undefined;
    controlsMessage = undefined;
    await tick();
    list.querySelector<HTMLElement>("button, input")?.focus();
    list.scrollTop = 0;
  }

  function onAction(action: Action): boolean {
    if (waiting !== undefined) return true;
    if (action === "tabPrev" || action === "tabNext") {
      void showTab(TABS[(TABS.indexOf(tab) + (action === "tabPrev" ? -1 : 1) + TABS.length) % TABS.length]!);
      return true;
    }
    if (action !== "left" && action !== "right") return false;
    // Inside a text field the arrows move the caret.
    if (document.activeElement instanceof HTMLInputElement) return false;
    // The controller's labels: left/right cross to the other column, at the nearest label by layout
    // height (the screen is tilted, so on-screen rects would drift up or down the same column).
    const at = document.activeElement;
    if (at instanceof HTMLElement && at.dataset["side"]) {
      if (at.dataset["side"] !== (action === "left" ? "right" : "left")) return true;
      const others = [...list.querySelectorAll<HTMLElement>(`[data-side="${action}"]`)];
      others.sort((p, q) => Math.abs(p.offsetTop - at.offsetTop) - Math.abs(q.offsetTop - at.offsetTop))[0]?.focus();
      return true;
    }
    // No option to adjust: left/right move the focus, as in any menu.
    const row = rows.find((r) => r.id === focused);
    if (!row?.adjust) return false;
    row.adjust(action === "left" ? -1 : 1);
    return true;
  }

  /** The controller tab's read-out: each control's name and every action on its button (the pad layout is fixed). */
  const PAD = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Start", "LS", "RS", "D-pad", "D-pad", "D-pad", "D-pad"];
  const padLabels = (() => {
    const actions: Record<string, string[]> = { LS: [t("settings.pad.walk")] };
    for (const action of ACTIONS) {
      const name = PAD[PAD_BUTTONS[action]]!;
      actions[name] = [...(actions[name] ?? []), t(`action.${action}`)];
    }
    const labels: Record<string, string> = {};
    for (const name of PAD) labels[name.toLowerCase().replace("-", "")] = `${name} · ${(actions[name] ?? ["—"]).join(" / ")}`;
    return labels;
  })();

  const hints = [
    { actions: ["tabPrev" as const], label: t("hints.prevSection") },
    { actions: ["tabNext" as const], label: t("hints.nextSection") },
    { actions: ["confirm" as const], label: t("hints.change") },
    { actions: ["cancel" as const], label: t("hints.back") },
  ];
</script>

<section class="fixed inset-0 bg-black/40" use:menu={{ onBack: () => waiting === undefined && onBack(), onAction }}>
  <h2 class="sr-only">{t("settings.title")}</h2>
  <div bind:this={host} class="absolute inset-0 overflow-hidden">
    <!-- Transparent: the model draws the black screen, diagonal included; the tabs sit in its raised strip. -->
    <div bind:this={screen} class="flex flex-col font-[system-ui,sans-serif] text-[length:calc(1rem/var(--dex-scale,1))] text-[#cfcfcf]" style:width="{DEX_SCREEN_W}px" style:height="{DEX_SCREEN_H}px">
      <div class="flex shrink-0 items-center gap-2 pr-5 text-[0.85em] font-bold uppercase" style:height="{DEX_STRIP_H}px" style:padding-left="{DEX_STRIP_LEFT}px" role="tablist">
        <span class="flex items-center gap-1 text-[#777]">&lt;<Glyph action="tabPrev" round /></span>
        {#each TABS as id, i (id)}
          {#if i > 0}<span class="text-[#555]" aria-hidden="true">|</span>{/if}
          <button type="button" role="tab" tabindex="-1" aria-selected={tab === id} class="border-0 bg-transparent px-2 py-0.5 font-bold uppercase text-[#bbb] aria-selected:bg-[#e8e8e8] aria-selected:text-[#111]" onclick={() => void showTab(id)}>{t(`settings.tab.${id}`)}</button>
        {/each}
        <span class="ml-auto flex items-center gap-1 text-[#777]"><Glyph action="tabNext" round />&gt;</span>
      </div>
      <div bind:this={list} class="scrollbar-clean flex-1 overflow-y-auto px-4 py-2" role="tabpanel">
        {#each rows as row (row.id)}
          <DexRow label={row.label} value={row.value} adjustable={row.adjust !== undefined} onclick={() => (row.activate ? row.activate() : row.adjust?.(1))} onfocus={() => (focused = row.id)} />
        {/each}
        {#if tab === "game"}
          {#each [{ id: "roomPassword", max: 64, placeholder: "" }, { id: "stunServer", max: 200, placeholder: "stun:stun.l.google.com:19302" }] as field (field.id)}
            <label class="flex items-center justify-between gap-6 px-3 py-[0.35em] text-[1.15em] font-bold focus-within:bg-[#e8e8e8] focus-within:text-[#111]">
              <span class="pl-[1.4ch]">{t(`settings.${field.id}` as Parameters<typeof t>[0])}</span>
              <input
                class="w-[22rem] border-0 border-b-2 border-dashed border-current bg-transparent text-right text-[0.9em] text-inherit outline-none"
                value={field.id === "roomPassword" ? $settings.roomPassword : $settings.stunServer}
                maxlength={field.max}
                placeholder={field.placeholder}
                autocomplete="off"
                spellcheck="false"
                onfocus={() => (focused = field.id)}
                onchange={(event) => void saveSettings(field.id === "roomPassword" ? { roomPassword: event.currentTarget.value } : { stunServer: event.currentTarget.value.trim() })}
              />
            </label>
          {/each}
        {:else if tab === "gamepad"}
          <GamepadFigure labels={padLabels} idle={t("settings.pad.idle")} />
        {:else if tab === "controls"}
          <Controls bind:waiting onMessage={(m: string | undefined) => (controlsMessage = m)} onFocus={(action: Action) => (focused = `action.${action}`)} />
        {/if}
      </div>
      <div class="mx-5 border-t-2 border-dashed border-[#444]"></div>
      <p class="m-0 min-h-[2.6em] px-5 pt-2 text-[1em] font-semibold text-[#999]" role="status">{note ? `> ${note}` : ""}</p>
      <div class="flex justify-end px-5 pb-3"><KeyHints {hints} /></div>
      <!-- Glare on the glass, over the text as on a real screen; below the strip so the red corner stays clean. -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-[20px] rounded-tl-[20px] bg-[linear-gradient(155deg,rgb(255_255_255/5%)_0%,rgb(255_255_255/2%)_38%,transparent_39%)]"
        style:top="{DEX_STRIP_H}px"
        aria-hidden="true"
      ></div>
    </div>
  </div>
  {#if askingRescue}
    <Confirm question={t("settings.stuck.confirm")} onAnswer={(yes) => { askingRescue = false; if (yes) onRescue?.(); }} />
  {/if}
</section>
