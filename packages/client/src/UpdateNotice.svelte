<script lang="ts">
  import type { UpdateState } from "@soulsilver/shared";
  import { t } from "./i18n";

  let { update, onRestart }: { update: UpdateState; onRestart: () => void } = $props();

  let hidden = $state(false);
</script>

{#if !hidden}
  {#if update.status === "downloading"}
    <p class="text-quiet text-[0.9rem]">{t("update.downloading", { version: update.version, percent: update.percent })}</p>
  {:else if update.status === "ready"}
    <section class="border border-[#c8c8c8] rounded-[6px] px-5 py-4 my-4 mx-0 max-w-[36rem] bg-panel" aria-labelledby="update-title" aria-live="polite">
      <h2 class="text-[1.1rem] mt-0 mx-0 mb-2" id="update-title">{t("update.ready", { from: update.currentVersion, to: update.newVersion })}</h2>
      <p>{t("update.why")}</p>
      <div class="flex gap-2">
        <button class="px-[0.9rem] py-[0.4rem]" onclick={onRestart}>{t("update.restart")}</button>
        <button class="px-[0.9rem] py-[0.4rem] bg-transparent" onclick={() => (hidden = true)}>{t("update.later")}</button>
      </div>
      <p class="text-quiet text-[0.9rem]">{t("update.laterNote")}</p>
    </section>
  {:else if update.status === "check-failed"}
    <footer class="text-quiet text-[0.9rem] fixed left-4 bottom-3">
      {t("update.checkFailed")}
      <button class="px-1 py-0 border-none bg-transparent text-inherit underline" onclick={() => (hidden = true)} aria-label={t("update.dismissLabel")}>{t("update.dismiss")}</button>
    </footer>
  {/if}
{/if}
