<script lang="ts">
  // About (spec 017, FR-006): version, credits and the fan-project notice.
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  let { version, onBack }: { version: string | undefined; onBack: () => void } = $props();
</script>

<section class="max-w-[40rem]" use:menu={{ onBack }}>
  <h2>{t("about.title")}</h2>
  <p>{t("app.version", { version: version ?? "—" })}</p>
  <h3>{t("about.creditsTitle")}</h3>
  <p>{t("about.credits")}</p>
  <p class="px-4 py-3 border-l-4 border-accent bg-panel">{t("about.disclaimer")}</p>
  <button type="button" onclick={onBack}>{t("common.back")}</button>
</section>
