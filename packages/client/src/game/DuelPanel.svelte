<script lang="ts">
  // The duel prompts (spec 028.5): the invitation with its rules, waiting for the answer, and the result. The fight
  // itself is the usual combat screen, in the duel's arena.
  import type { ServerMessage } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let {
    duel,
    partnerName,
    onAnswer,
    onCancel,
    onClose,
  }: {
    duel: Extract<ServerMessage, { type: "duelState" }>;
    partnerName: string;
    onAnswer: (accept: boolean) => void;
    onCancel: () => void;
    onClose: () => void;
  } = $props();

  const rules = $derived(t("duel.rules", { level: duel.rules.level === "50" ? t("duel.level50") : t("duel.levelCurrent"), team: duel.rules.team }));
</script>

<section class="absolute inset-x-0 bottom-0 z-4 grid gap-2 p-4 bg-black/80 text-[#eef]" use:menu={{ onBack: () => (duel.phase === "ended" ? onClose() : duel.phase === "invited" ? onAnswer(false) : onCancel()) }}>
  {#if duel.phase === "invited"}
    <p class="m-0">{t("duel.invited", { name: partnerName })} {rules}</p>
    <div class="flex gap-2">
      <button type="button" onclick={() => onAnswer(true)}>{t("trade.accept")}</button>
      <button type="button" onclick={() => onAnswer(false)}>{t("trade.decline")}</button>
    </div>
  {:else if duel.phase === "waiting"}
    <p class="m-0">{t("duel.waiting", { name: partnerName })} {rules}</p>
    <button type="button" class="justify-self-start" onclick={onCancel}>{t("trade.cancel")}</button>
  {:else if duel.phase === "ended"}
    <p class="m-0">{t(`duel.result.${duel.result ?? "aborted"}`, { name: partnerName })} {t("duel.nothingLost")}</p>
    <button type="button" class="justify-self-start" onclick={onClose}>{t("trade.close")}</button>
  {/if}
</section>
