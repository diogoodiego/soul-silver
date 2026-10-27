<script lang="ts">
  // The script debugger (spec 020, US4): where this player's script is, their flags and variables,
  // and a flag switch the server only honours in development builds.
  import type { ServerMessage } from "@soulsilver/shared/game";
  import { t } from "../i18n";

  let { view, onSetFlag }: { view: Extract<ServerMessage, { type: "script-debug" }> | undefined; onSetFlag: (flag: number, on: boolean) => void } = $props();

  let flag = $state("");
  const id = $derived(Number(flag));
  const valid = $derived(Number.isInteger(id) && id >= 1 && id <= 0xffff);
</script>

<section class="fixed bottom-2 right-2 max-w-[28rem] max-h-[45vh] overflow-auto m-0 px-3 py-2 bg-black/75 text-white [font:12px_monospace] z-6" aria-label={t("scriptDebug.label")}>
  <h2 class="m-0 mb-1 text-[12px]">{t("scriptDebug.label")}</h2>
  {#if view?.at}
    <p class="m-0">{t("scriptDebug.at", { file: view.at.file, entry: view.at.entry, pc: view.at.pc, depth: view.at.depth })}</p>
    <p class="m-0 font-bold">{view.at.command}</p>
  {:else}
    <p class="m-0">{t("scriptDebug.idle")}</p>
  {/if}
  <p class="m-0 mt-1">{t("scriptDebug.flags")}: {view?.flags.join(", ") || "—"}</p>
  <p class="m-0">{t("scriptDebug.vars")}: {Object.entries(view?.vars ?? {}).map(([k, v]) => `0x${Number(k).toString(16)}=${v}`).join(", ") || "—"}</p>
  <form class="flex gap-1 mt-1" onsubmit={(e) => e.preventDefault()}>
    <label class="sr-only" for="script-debug-flag">{t("scriptDebug.flag")}</label>
    <input id="script-debug-flag" class="w-20 bg-white/10 text-white px-1" inputmode="numeric" placeholder={t("scriptDebug.flag")} bind:value={flag} />
    <button type="button" disabled={!valid} onclick={() => onSetFlag(id, true)}>{t("scriptDebug.set")}</button>
    <button type="button" disabled={!valid} onclick={() => onSetFlag(id, false)}>{t("scriptDebug.clear")}</button>
  </form>
</section>
