<script lang="ts">
  // Settings (spec 017, US7; audio spec 018) on a 3D Pokédex: four tabs on its screen, LB/RB between them,
  // left/right change the focused option. Each change is saved by the main process and applies at once.
  import Button from "../ui/Button.svelte";
  import { STEP_1_EFFECTS, TEXT_SPEEDS, UI_SCALES, VISUAL_EFFECTS, VISUAL_QUALITIES, WINDOW_SIZES } from "@soulsilver/shared";
  import { type Action, ACTIONS, PAD_ACTIONS } from "@soulsilver/shared/input";
  import { onMount, tick } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import { createPokedex, DEX_SCREEN_H, DEX_SCREEN_W } from "../render/pokedex-model";
  import { saveSettings, settings } from "../settings";
  import Checkbox from "../ui/Checkbox.svelte";
  import Confirm from "../ui/Confirm.svelte";
  import SegmentedTabs from "../ui/SegmentedTabs.svelte";
  import SlantBar from "../ui/SlantBar.svelte";
  import TextField from "../ui/TextField.svelte";
  import DexRow from "../ui/DexRow.svelte";
  import DexTabs from "../ui/DexTabs.svelte";
  import GamepadFigure from "../ui/GamepadFigure.svelte";
  import KeyHints from "../ui/KeyHints.svelte";
  import Controls from "./Controls.svelte";

  // onRescue only in game: the title screen has nowhere to rescue from. Embedded (block H), the screen alone,
  // inside the game's Pokédex phone, which draws the device.
  let { onRescue, onBack, embedded = false }: { onRescue?: () => void; onBack: () => void; embedded?: boolean } = $props();

  const TABS = ["game", "audio", "video", "gamepad", "controls", "accessibility"] as const;
  type Tab = (typeof TABS)[number];
  let tab = $state<Tab>("game");
  /** The focused row's id, for the note at the bottom of the screen. */
  let focused = $state<string | undefined>();
  let askingRescue = $state(false);
  let askingDelete = $state(false);
  /** Held to delete the extracted data (title screen only: a running session reads it). */
  const DELETE = "picker";
  /** The controls tab: the action waiting for its new key, and its outcome. */
  let waiting = $state<Action | undefined>();
  let controlsMessage = $state<string | undefined>();

  // Bound only outside the phone (block H), where the screen draws its own Pokédex.
  let host = $state<HTMLDivElement>();
  let screen = $state<HTMLDivElement>();
  let list: HTMLDivElement;
  let setDither = $state<(on: boolean) => void>();
  onMount(() => {
    if (embedded || !host || !screen) return;
    const dex = createPokedex(host, screen);
    setDither = dex.setDither;
    return dex.dispose;
  });
  $effect(() => setDither?.($settings.dither));

  interface Row {
    id: string;
    label: string;
    value: string;
    /** Left (-1) and right (1); a click steps forward. */
    adjust?: (by: -1 | 1) => void;
    /** Confirm, when it is not a step forward. */
    activate?: () => void;
    /** Drawn by a component instead of the plain value. */
    view?: { kind: "toggle"; on: boolean } | { kind: "bar"; level: number; cells: number } | { kind: "tabs"; options: string[]; current: string };
  }

  /** Up to four options show side by side as tabs; more (window sizes) as "< value >". */
  function choice<T>(id: string, label: string, options: readonly T[], current: T, name: (option: T) => string, apply: (option: T) => void): Row {
    const at = Math.max(0, options.indexOf(current));
    const adjust = (by: -1 | 1) => apply(options[(at + by + options.length) % options.length]!);
    if (options.length <= 4) return { id, label, value: name(current), adjust, view: { kind: "tabs", options: options.map(name), current: name(current) } };
    return { id, label, value: `< ${name(current)} >`, adjust };
  }
  function toggle(id: string, label: string, on: boolean, apply: (on: boolean) => void): Row {
    return { id, label, value: t(on ? "settings.on" : "settings.off"), adjust: () => apply(!on), view: { kind: "toggle", on } };
  }
  /** 0–100 in steps of `step` (5 by default), drawn as a 10-cell bar. */
  function slider(id: string, label: string, value: number, apply: (value: number) => void, step = 5): Row {
    return { id, label, value: `${value}%`, adjust: (by) => apply(Math.max(0, Math.min(100, value + by * step))), view: { kind: "bar", level: value, cells: Math.min(20, 100 / step) } };
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
          toggle("dither", t("settings.dither"), s.dither, (dither) => void saveSettings({ dither })),
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
    if ((tab === "controls" || tab === "gamepad") && (controlsMessage || focused?.startsWith("action."))) return controlsMessage ?? t(tab === "gamepad" ? "controls.hintPad" : "controls.hint");
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

  /** The controller tab's read-out: each control's name and every action on its button. */
  const PAD = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Start", "LS", "RS", "D-pad", "D-pad", "D-pad", "D-pad"];
  const padId = (button: number) => PAD[button]!.toLowerCase().replace("-", "");
  const padLabels = $derived.by(() => {
    const actions: Record<string, string[]> = { LS: [t("settings.pad.walk")] };
    for (const action of ACTIONS) {
      const name = PAD[$settings.pad[action]]!;
      actions[name] = [...(actions[name] ?? []), t(`action.${action}`)];
    }
    const labels: Record<string, string> = {};
    for (const [button, name] of PAD.entries()) labels[padId(button)] = `${name} · ${(actions[name] ?? ["—"]).join(" / ")}`;
    return labels;
  });

  /** A label of the figure goes to the row of its first action. */
  function pickControl(id: string): void {
    const action = PAD_ACTIONS.find((a) => padId($settings.pad[a]) === id);
    if (action) list.querySelector<HTMLElement>(`[data-action="${action}"] button`)?.focus();
  }

  const hints = [
    { actions: ["tabPrev" as const], label: t("hints.prevSection") },
    { actions: ["tabNext" as const], label: t("hints.nextSection") },
    { actions: ["confirm" as const], label: t("hints.change") },
    { actions: ["cancel" as const], label: t("hints.back") },
  ];
</script>

{#snippet content()}
      <DexTabs tabs={TABS.map((id) => ({ id, label: t(`settings.tab.${id}`) }))} current={tab} onSelect={(id: Tab) => void showTab(id)} />
      <div bind:this={list} class="scrollbar-clean flex-1 overflow-y-auto px-4 py-2" role="tabpanel">
        {#each rows as row (row.id)}
          {@const view = row.view}
          <DexRow label={row.label} value={row.value} pressed={view?.kind === "toggle" ? view.on : undefined} adjustable={row.adjust !== undefined} onclick={() => (row.activate ? row.activate() : row.adjust?.(1))} onfocus={() => (focused = row.id)}>
            {#if view?.kind === "toggle"}<Checkbox checked={view.on} />
            {:else if view?.kind === "bar"}<SlantBar value={view.level} cells={view.cells} />
            {:else if view?.kind === "tabs"}<SegmentedTabs options={view.options} current={view.current} />
            {:else}{row.value}{/if}
          </DexRow>
        {/each}
        {#if tab === "game"}
          <div class="grid gap-3 px-3 pt-2">
            {#each [{ id: "roomPassword", max: 64, placeholder: "" }, { id: "stunServer", max: 200, placeholder: "stun:stun.l.google.com:19302" }] as field (field.id)}
              <TextField
                label={t(`settings.${field.id}` as Parameters<typeof t>[0])}
                value={field.id === "roomPassword" ? $settings.roomPassword : $settings.stunServer}
                maxlength={field.max}
                placeholder={field.placeholder}
                autocomplete="off"
                spellcheck="false"
                onfocus={() => (focused = field.id)}
                onchange={(event: Event & { currentTarget: HTMLInputElement }) => void saveSettings(field.id === "roomPassword" ? { roomPassword: event.currentTarget.value } : { stunServer: event.currentTarget.value.trim() })}
              />
            {/each}
            {#if !onRescue}
              <div class="flex justify-end">
                <Button variant="danger" hold={{ action: DELETE, armed: !askingDelete, onHeld: () => (askingDelete = true), ms: 1500 }}>{t("settings.deleteExtraction")}</Button>
              </div>
            {/if}
          </div>
        {:else if tab === "gamepad"}
          <GamepadFigure labels={padLabels} idle={t("settings.pad.idle")} onPick={pickControl} />
          <Controls pad bind:waiting onMessage={(m: string | undefined) => (controlsMessage = m)} onFocus={(action: Action) => (focused = `action.${action}`)} />
        {:else if tab === "controls"}
          <Controls bind:waiting onMessage={(m: string | undefined) => (controlsMessage = m)} onFocus={(action: Action) => (focused = `action.${action}`)} />
        {/if}
      </div>
      <div class="mx-5 border-t-2 border-dashed border-default"></div>
      <p class="m-0 min-h-[2.6em] px-5 pt-2 text-base font-semibold text-secondary" role="status">{note ? `> ${note}` : ""}</p>
      <div class="flex justify-end px-5 pb-3"><KeyHints {hints} /></div>
{/snippet}

{#if embedded}
  <section class="relative flex size-full flex-col" use:menu={{ onBack: () => waiting === undefined && onBack(), onAction }}>
    <h2 class="sr-only">{t("settings.title")}</h2>
    {@render content()}
    {#if askingDelete}
      <Confirm question={t("settings.deleteExtraction.confirm")} onAnswer={(yes) => { askingDelete = false; if (yes) void window.soulSilver.deleteExtraction(); }} />
    {/if}
    {#if askingRescue}
      <Confirm question={t("settings.stuck.confirm")} onAnswer={(yes) => { askingRescue = false; if (yes) onRescue?.(); }} />
    {/if}
  </section>
{:else}
  <section class="fixed inset-0 bg-surface-overlay" use:menu={{ onBack: () => waiting === undefined && onBack(), onAction }}>
    <h2 class="sr-only">{t("settings.title")}</h2>
    <div bind:this={host} class="absolute inset-0 overflow-hidden">
      <!-- Transparent: the model draws the black screen, diagonal included; the tabs sit in its raised strip. -->
      <div bind:this={screen} class="flex flex-col font-[system-ui,sans-serif] text-[length:calc(1rem/var(--dex-scale,1))] text-secondary" class:dither={$settings.dither} style:width="{DEX_SCREEN_W}px" style:height="{DEX_SCREEN_H}px">
        {@render content()}
      </div>
    </div>
    {#if askingDelete}
      <Confirm question={t("settings.deleteExtraction.confirm")} onAnswer={(yes) => { askingDelete = false; if (yes) void window.soulSilver.deleteExtraction(); }} />
    {/if}
    {#if askingRescue}
      <Confirm question={t("settings.stuck.confirm")} onAnswer={(yes) => { askingRescue = false; if (yes) onRescue?.(); }} />
    {/if}
  </section>
{/if}
