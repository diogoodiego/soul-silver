<script lang="ts">
  // Controls (spec 017, US7): rebind any action's key, see the fixed Xbox button, restore the defaults.
  import { type Action, ACTIONS, DEFAULT_KEYS, rebind } from "@soulsilver/shared/input";
  import Glyph from "../Glyph.svelte";
  import { t } from "../i18n";
  import { keyName } from "../input/key-name";
  import { menu } from "../input/menu";
  import { saveSettings, settings } from "../settings";

  let { onBack }: { onBack: () => void } = $props();

  let waiting = $state<Action | undefined>();
  let message = $state<string | undefined>();

  function capture(action: Action): void {
    waiting = action;
    message = t("controls.pressKey", { action: t(`action.${action}`) });
    // Capture phase, ahead of the input layer: the key is being chosen, not used.
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.removeEventListener("keydown", onKey, true);
      waiting = undefined;
      if (event.code === "Escape") {
        message = undefined;
        return;
      }
      try {
        const { bindings, swapped } = rebind($settings.bindings, action, event.code);
        void saveSettings({ bindings });
        message = swapped ? t("controls.swapped", { key: keyName(event.code), other: t(`action.${swapped}`) }) : undefined;
      } catch {
        message = t("controls.reserved", { key: keyName(event.code) });
      }
    };
    window.addEventListener("keydown", onKey, true);
  }
</script>

<section use:menu={{ onBack: () => waiting === undefined && onBack() }}>
  <h2>{t("controls.title")}</h2>
  <p class="text-muted">{t("controls.hint")}</p>
  <table class="border-collapse mb-4">
    <thead>
      <tr><th class="px-3 py-[0.2rem] text-left">{t("controls.action")}</th><th class="px-3 py-[0.2rem] text-left">{t("controls.keyboard")}</th><th class="px-3 py-[0.2rem] text-left">{t("controls.gamepad")}</th></tr>
    </thead>
    <tbody>
      {#each ACTIONS as action (action)}
        <tr>
          <td class="px-3 py-[0.2rem] text-left">{t(`action.${action}`)}</td>
          <td class="px-3 py-[0.2rem] text-left">
            <button type="button" class="min-w-32 px-[0.6rem] py-[0.2rem]" aria-pressed={waiting === action} onclick={() => capture(action)}>
              {waiting === action ? "…" : $settings.bindings[action].map(keyName).join(" / ")}
            </button>
          </td>
          <td class="px-3 py-[0.2rem] text-left"><Glyph {action} pad /></td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if message}<p role="status">{message}</p>{/if}
  <div class="flex gap-2">
    <button type="button" onclick={() => void saveSettings({ bindings: structuredClone(DEFAULT_KEYS) }).then(() => (message = t("controls.restored")))}>{t("controls.restore")}</button>
    <button type="button" onclick={onBack}>{t("common.back")}</button>
  </div>
</section>
