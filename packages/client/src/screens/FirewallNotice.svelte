<script lang="ts">
  // Shown once, before the first time the player hosts, so the Windows firewall prompt is no surprise (spec 012, FR-014).
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let { onContinue, onBack }: { onContinue: () => void; onBack: () => void } = $props();
</script>

<section class="max-w-[36rem]" use:menu={{ onBack }}>
  <h2>{t("firewall.title")}</h2>
  <p>{t("firewall.why")}</p>
  <p>{t("firewall.how")}</p>
  <div class="flex gap-2">
    <button type="button" onclick={onContinue}>{t("firewall.continue")}</button>
    <button type="button" onclick={onBack}>{t("common.back")}</button>
  </div>
</section>
