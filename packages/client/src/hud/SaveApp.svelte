<script lang="ts">
  // Block H: the Save app. "Save now" asks the server for a save at once (it allows one a second); the time
  // shown is of the last save this client wrote, the server's own autosaves included.
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let { savedAt, leaving, onSave, onLeave, onBack }: { savedAt: Date | undefined; leaving: boolean; onSave: () => void; onLeave: () => void; onBack: () => void } = $props();

  let asked = $state(false);
  const time = $derived(savedAt?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));

  function save(): void {
    asked = true;
    onSave();
  }
</script>

<section class="grid h-full content-center justify-items-center gap-4 px-6 py-4 text-center" use:menu={{ onBack }}>
  <h2 class="m-0 text-[1.3em]">{t("saveApp.title")}</h2>
  <p class="m-0 text-[1.1em]" role="status">{time ? t("saveApp.done", { time }) : asked ? t("pause.saving") : t("saveApp.never")}</p>
  <button type="button" class="m-0 min-w-[14rem] text-[1.1em]" onclick={save}>{t("saveApp.now")}</button>
  <p class="m-0 max-w-[30rem] text-[0.9em] opacity-70">{t("saveApp.auto")}</p>
  <div class="flex gap-3">
    <button type="button" class="m-0" disabled={leaving} onclick={onLeave}>{leaving ? t("pause.saving") : t("pause.leave")}</button>
    <button type="button" class="m-0" onclick={onBack}>{t("common.back")}</button>
  </div>
</section>
