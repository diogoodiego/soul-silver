<script lang="ts">
  import Button from "../ui/Button.svelte";
  import { type AssetsFailure, type AssetsState, romRejectionMessage } from "@soulsilver/shared";
  import Confirm from "../ui/Confirm.svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import { etaSeconds, type ProgressSample } from "./eta";

  let { assets }: { assets: AssetsState } = $props();

  let dragging = $state(false);

  const api = window.soulSilver;
  const acceptsRom = $derived(assets.status === "needs-rom" || assets.status === "rejected");

  let askingCancel = $state(false);

  // First progress sample of the current extraction; the ETA uses the average rate since it.
  let first: ProgressSample | undefined;
  const eta = $derived.by(() => {
    if (assets.status !== "extracting") {
      first = undefined;
      return undefined;
    }
    const now = { t: performance.now(), percent: assets.percent };
    first ??= now;
    return etaSeconds(first, now);
  });

  function etaText(seconds: number): string {
    return seconds < 60 ? t("firstRun.etaSeconds", { n: Math.max(5, Math.ceil(seconds / 5) * 5) }) : t("firstRun.etaMinutes", { n: Math.ceil(seconds / 60) });
  }

  function formatBytes(bytes: number): string {
    const gb = bytes / 1024 ** 3;
    return gb >= 1 ? `${gb.toFixed(1).replace(".", ",")} GB` : `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  }

  function failureMessage(failure: AssetsFailure): string {
    switch (failure.code) {
      case "disk-full":
        return t("firstRun.fail.diskFull", { required: formatBytes(failure.requiredBytes), available: formatBytes(failure.availableBytes) });
      case "write-permission":
        return t("firstRun.fail.writePermission", { path: failure.path });
      case "busy":
        return t("firstRun.fail.busy");
      case "rom-copy-failed":
        return t("firstRun.fail.romCopy");
      case "stage-failed":
        return t("firstRun.fail.stage", { stage: failure.stageTitle });
      case "unexpected":
        return t("firstRun.fail.unexpected");
    }
  }

  function onDragOver(event: DragEvent): void {
    if (!acceptsRom) return;
    event.preventDefault();
    dragging = true;
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragging = false;
    const file = event.dataTransfer?.files[0];
    if (acceptsRom && file) void api.submitRomFile(file);
  }

  function cancel(): void {
    askingCancel = true;
  }
</script>

<svelte:window ondragover={onDragOver} ondragleave={() => (dragging = false)} ondrop={onDrop} />

<section class={["max-w-[36rem] px-5 py-4 border-2 rounded-[6px]", dragging ? "border-dashed border-selected layer-surface-selected" : "border-transparent"]} aria-live="polite" use:menu>
  {#if assets.status === "checking"}
    <p class="text-tertiary text-sm">{t("firstRun.checking")}</p>
  {:else if assets.status === "needs-rom" || assets.status === "rejected"}
    <h2 class="text-xl mt-0 mx-0 mb-3">{t("firstRun.welcome")}</h2>
    <p>{t("firstRun.needRom")}</p>
    <p class="text-tertiary text-sm">{t("firstRun.local")}</p>

    {#if assets.status === "needs-rom" && assets.previousRomInvalid}
      <div class="my-4 mx-0 px-4 py-3 border-l-4 border-alarm bg-[rgb(176_0_32/18%)]" role="alert">
        <p class="my-1 mx-0">{t("firstRun.romChanged")}</p>
      </div>
    {/if}

    {#if assets.status === "rejected"}
      {@const message = romRejectionMessage(assets.rejection)}
      <div class="my-4 mx-0 px-4 py-3 border-l-4 border-alarm bg-[rgb(176_0_32/18%)]" role="alert">
        <p class="my-1 mx-0"><strong>{message.title}</strong></p>
        <p class="my-1 mx-0">{message.detail}</p>
      </div>
    {/if}

    {#if assets.status === "needs-rom" && assets.savedRom}
      <div class="mt-4">
        <p>{t("firstRun.interrupted")}</p>
        <div class="flex gap-2">
          <Button onclick={() => void api.startExtraction()}>{t("firstRun.resume")}</Button>
        </div>
      </div>
    {/if}

    <div class="mt-5 p-4 border border-dashed border-default rounded-[6px] text-center">
      <p class="mt-0 mx-0 mb-2">{t("firstRun.drag")}</p>
      <div class="flex gap-2 justify-center">
        <Button onclick={() => void api.chooseRom()}>
          {assets.status === "rejected" ? t("firstRun.chooseOther") : t("firstRun.choose")}
        </Button>
      </div>
    </div>
  {:else if assets.status === "validating"}
    <p>{t("firstRun.validating")}</p>
  {:else if assets.status === "extracting"}
    <h2 class="text-xl mt-0 mx-0 mb-3">{t(`firstRun.mode.${assets.mode}`)}</h2>
    <p>{assets.stageTitle}</p>
    <progress class="w-full h-4" max="100" value={assets.percent}></progress>
    <p class="tabular-nums">{assets.percent}%{eta === undefined ? "" : ` · ${etaText(eta)}`}</p>
    <div class="flex gap-2">
      <Button variant="ghost" onclick={cancel}>{t("common.cancel")}</Button>
    </div>
  {:else if assets.status === "cancelling"}
    <p>{t("firstRun.cancelling")}</p>
  {:else if assets.status === "failed"}
    <div class="my-4 mx-0 px-4 py-3 border-l-4 border-alarm bg-[rgb(176_0_32/18%)]" role="alert">
      <p class="my-1 mx-0"><strong>{t("firstRun.failed")}</strong></p>
      <p class="my-1 mx-0">{failureMessage(assets.failure)}</p>
    </div>
    <div class="flex gap-2">
      <Button onclick={() => void api.startExtraction()}>{t("firstRun.retry")}</Button>
      <Button variant="ghost" onclick={() => void api.openExtractionLog()}>{t("firstRun.openLog")}</Button>
    </div>
  {:else if assets.status === "ready"}
    <h2 class="text-xl mt-0 mx-0 mb-3">{t("firstRun.ready")}</h2>
  {/if}
</section>

{#if askingCancel}
  <Confirm
    question={t("firstRun.confirmCancel")}
    onAnswer={(yes: boolean) => {
      askingCancel = false;
      if (yes) void api.cancelExtraction();
    }}
  />
{/if}
