<script lang="ts">
  // Main menu (spec 017, US1): Play, Settings, About and Quit, with the downloaded-update notice.
  import type { UpdateState } from "@soulsilver/shared";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import UpdateNotice from "../UpdateNotice.svelte";

  let {
    notice,
    update,
    serverReady,
    serverFailed,
    onPlay,
    onSettings,
    onAbout,
  }: { notice?: string | undefined; update: UpdateState; serverReady: boolean; serverFailed: boolean; onPlay: () => void; onSettings: () => void; onAbout: () => void } = $props();
</script>

<section class="home" use:menu>
  <h1>SoulSilver Desktop</h1>
  <UpdateNotice {update} onRestart={() => void window.soulSilver.restartToUpdate()} />
  {#if notice}<p class="text-danger font-bold" role="alert">{notice}</p>{/if}
  {#if serverFailed}
    <p class="text-danger font-bold" role="alert">{t("home.serverFailed")}</p>
  {:else if !serverReady}
    <p role="status">{t("home.serverStarting")}</p>
  {/if}
  <nav class="grid gap-[0.6rem] max-w-[18rem]">
    <button type="button" disabled={!serverReady} onclick={onPlay}>{t("home.play")}</button>
    <button type="button" onclick={onSettings}>{t("home.settings")}</button>
    <button type="button" onclick={onAbout}>{t("home.about")}</button>
    <button type="button" onclick={() => void window.soulSilver.quitApp()}>{t("home.quit")}</button>
  </nav>
</section>
