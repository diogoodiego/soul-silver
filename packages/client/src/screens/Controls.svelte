<script lang="ts">
  // Controls (spec 017, US7), the Pokédex's keyboard tab: rebind any action's key, restore the defaults. The pad has its own tab.
  import { type Action, ACTIONS, DEFAULT_KEYS, rebind } from "@soulsilver/shared/input";
  import { t } from "../i18n";
  import { keyName } from "../input/key-name";
  import { saveSettings, settings } from "../settings";
  import DexRow from "../ui/DexRow.svelte";

  let {
    waiting = $bindable(),
    onMessage,
    onFocus,
  }: { waiting: Action | undefined; onMessage: (message: string | undefined) => void; onFocus: (action: Action) => void } = $props();

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

{#each ACTIONS as action (action)}
  <DexRow label={t(`action.${action}`)} pressed={waiting === action} onclick={() => capture(action)} onfocus={() => onFocus(action)}>
    {waiting === action ? "…" : $settings.bindings[action].map(keyName).join(" / ")}
  </DexRow>
{/each}
<DexRow
  label={t("controls.restore")}
  onclick={() => void saveSettings({ bindings: structuredClone(DEFAULT_KEYS) }).then(() => onMessage(t("controls.restored")))}
  onfocus={() => onMessage(undefined)}
/>
