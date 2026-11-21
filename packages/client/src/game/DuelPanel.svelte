<script lang="ts">
  // The duel prompts (spec 028.5): the invitation with its rules, waiting for the answer, and the result. The fight
  // itself is the usual combat screen, in the duel's arena.
  import Button from "../ui/Button.svelte";
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

<section class="absolute inset-x-0 bottom-0 z-4 grid gap-2 p-4 bg-surface-overlay text-primary" use:menu={{ onBack: () => (duel.phase === "ended" ? onClose() : duel.phase === "invited" ? onAnswer(false) : onCancel()) }}>
  {#if duel.phase === "invited"}
    <p class="m-0">{t("duel.invited", { name: partnerName })} {rules}</p>
    <div class="flex gap-2">
      <Button onclick={() => onAnswer(true)}>{t("trade.accept")}</Button>
      <Button onclick={() => onAnswer(false)}>{t("trade.decline")}</Button>
    </div>
  {:else if duel.phase === "waiting"}
    <p class="m-0">{t("duel.waiting", { name: partnerName })} {rules}</p>
    <Button class="justify-self-start" onclick={onCancel}>{t("trade.cancel")}</Button>
  {:else if duel.phase === "ended"}
    <p class="m-0">{t(`duel.result.${duel.result ?? "aborted"}`, { name: partnerName })} {t("duel.nothingLost")}</p>
    <Button class="justify-self-start" onclick={onClose}>{t("trade.close")}</Button>
  {/if}
</section>
