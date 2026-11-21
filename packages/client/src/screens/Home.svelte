<script lang="ts">
  // Main menu (spec 017, US1): Play, Settings, About and Quit, with the downloaded-update notice.
  import type { UpdateState } from "@soulsilver/shared";
  import Button from "../ui/Button.svelte";
  import { t } from "../i18n";
  import { input } from "../input/app-input";
  import { menu } from "../input/menu";
  import KeyHints from "../ui/KeyHints.svelte";
  import UpdateNotice from "../ui/UpdateNotice.svelte";
  import { slideUp } from "./slide-up";

  let {
    notice,
    update,
    serverReady,
    serverFailed,
    onPlay,
    onArena,
    onSettings,
    onAbout,
    onBack,
  }: {
    notice?: string | undefined;
    update: UpdateState;
    serverReady: boolean;
    serverFailed: boolean;
    onPlay: () => void;
    /** The dev arena: needs no save, so it sits next to Play. */
    onArena: () => void;
    onSettings: () => void;
    onAbout: () => void;
    onBack: () => void;
  } = $props();

  const hints = [
    { actions: ["confirm" as const], label: t("hints.select") },
    { actions: ["cancel" as const], label: t("hints.back") },
    { actions: ["menu" as const], label: t("hints.options") },
    { actions: ["up" as const, "down" as const], label: t("hints.navigate") },
  ];

  // Escape is bound to both back and options: back wins, so options only answers when cancel is not held.
  const onAction = (action: string) => {
    if (action !== "menu" || input.held("cancel")) return false;
    onSettings();
    return true;
  };

</script>

<!-- Right edge, vertically centred, over the title backdrop. -->
<section class="home fixed inset-0 flex flex-col items-end justify-center gap-2 pr-12 text-right" use:menu={{ onBack, onAction }} in:slideUp out:slideUp>
  <UpdateNotice {update} onRestart={() => void window.soulSilver.restartToUpdate()} />
  {#if notice}<p class="text-danger font-bold" role="alert">{notice}</p>{/if}
  {#if serverFailed}
    <p class="text-danger font-bold" role="alert">{t("home.serverFailed")}</p>
  {:else if !serverReady}
    <p role="status">{t("home.serverStarting")}</p>
  {/if}
  <nav class="flex flex-col items-end gap-1">
    <Button variant="menu" glyph="confirm" onclick={onPlay} disabled={!serverReady}>{t("home.play")}</Button>
    <Button variant="menu" glyph="confirm" onclick={onArena} disabled={!serverReady}>{t("home.arena")}</Button>
    <Button variant="menu" glyph="confirm" onclick={onSettings}>{t("home.settings")}</Button>
    <Button variant="menu" glyph="confirm" onclick={onAbout}>{t("home.about")}</Button>
    <Button variant="menu" glyph="confirm" onclick={() => void window.soulSilver.quitApp()}>{t("home.quit")}</Button>
  </nav>
  <div class="absolute right-12 bottom-6"><KeyHints {hints} /></div>
</section>
