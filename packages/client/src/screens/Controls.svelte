<script lang="ts">
  // Controls (spec 017, US7), the Pokédex's keyboard tab and, with `pad`, the rows under the controller figure:
  // rebind any action's key or pad button, restore the defaults.
  import { type Action, ACTIONS, DEFAULT_KEYS, PAD_ACTIONS, PAD_BUTTONS, rebind, rebindPad } from "@soulsilver/shared/input";
  import { onDestroy } from "svelte";
  import { t } from "../i18n";
  import { input } from "../input/app-input";
  import { keyName, padName } from "../input/key-name";
  import { saveSettings, settings } from "../settings";
  import DexRow from "../ui/DexRow.svelte";

  let {
    waiting = $bindable(),
    pad = false,
    onMessage,
    onFocus,
  }: { waiting: Action | undefined; pad?: boolean; onMessage: (message: string | undefined) => void; onFocus: (action: Action) => void } = $props();

  let cancelPad: (() => void) | undefined;
  onDestroy(() => cancelPad?.());

  function capturePad(action: Action): void {
    cancelPad?.();
    waiting = action;
    onMessage(t("controls.pressButton", { action: t(`action.${action}`) }));
    const end = (message: string | undefined) => {
      cancelPad?.();
      onMessage(message);
    };
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === "Escape") end(undefined);
    };
    window.addEventListener("keydown", onKey, true);
    const stop = input.capturePad((button) => {
      try {
        const next = rebindPad($settings.pad, action, button);
        void saveSettings({ pad: next.pad });
        end(next.swapped.length > 0 ? t("controls.swappedPad", { button: padName(button), others: next.swapped.map((a) => t(`action.${a}`)).join(", ") }) : undefined);
      } catch {
        end(t("controls.reservedPad", { button: padName(button) }));
      }
    });
    cancelPad = () => {
      stop();
      window.removeEventListener("keydown", onKey, true);
      waiting = undefined;
      cancelPad = undefined;
    };
  }

  function capture(action: Action): void {
    waiting = action;
    onMessage(t("controls.pressKey", { action: t(`action.${action}`) }));
    // Capture phase, ahead of the input layer: the key is being chosen, not used.
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.removeEventListener("keydown", onKey, true);
      waiting = undefined;
      if (event.code === "Escape") {
        onMessage(undefined);
        return;
      }
      try {
        const { bindings, swapped } = rebind($settings.bindings, action, event.code);
        void saveSettings({ bindings });
        onMessage(swapped ? t("controls.swapped", { key: keyName(event.code), other: t(`action.${swapped}`) }) : undefined);
      } catch {
        onMessage(t("controls.reserved", { key: keyName(event.code) }));
      }
    };
    window.addEventListener("keydown", onKey, true);
  }
</script>

{#each pad ? PAD_ACTIONS : ACTIONS as action (action)}
  <div class="contents" data-action={action}>
  <DexRow label={t(`action.${action}`)} pressed={waiting === action} onclick={() => (pad ? capturePad(action) : capture(action))} onfocus={() => onFocus(action)}>
    {waiting === action ? "…" : pad ? padName($settings.pad[action]) : $settings.bindings[action].map(keyName).join(" / ")}
  </DexRow>
  </div>
{/each}
<DexRow
  label={t("controls.restore")}
  onclick={() => void saveSettings(pad ? { pad: { ...PAD_BUTTONS } } : { bindings: structuredClone(DEFAULT_KEYS) }).then(() => onMessage(t("controls.restored")))}
  onfocus={() => onMessage(undefined)}
/>
