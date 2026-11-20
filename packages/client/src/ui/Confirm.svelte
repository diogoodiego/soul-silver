<script lang="ts">
  // A yes/no question the pad can answer (spec 017, FR-018); replaces window.confirm.
  import Button from "./Button.svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let { question, onAnswer }: { question: string; onAnswer: (yes: boolean) => void } = $props();
</script>

<div class="fixed inset-0 grid place-items-center bg-overlay z-10">
  <div class="max-w-[28rem] px-5 py-4 bg-panel border-2 border-default rounded-[6px]" role="alertdialog" aria-label={question} use:menu={{ onBack: () => onAnswer(false) }}>
    <p>{question}</p>
    <div class="flex gap-2 justify-end">
      <Button onclick={() => onAnswer(false)}>{t("common.no")}</Button>
      <Button onclick={() => onAnswer(true)}>{t("common.yes")}</Button>
    </div>
  </div>
</div>
