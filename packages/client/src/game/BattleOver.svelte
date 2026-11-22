<script lang="ts">
  // How a trainer battle ended and why, over the field while it holds before closing (protocol 47).
  import { t } from "../i18n";

  let { result }: { result: "won" | "lost" } = $props();
</script>

<div class="pointer-events-none absolute inset-x-0 top-1/4 z-3 grid justify-items-center bg-surface-overlay px-4 py-6 text-center" role="status">
  <p class="m-0 text-6xl font-bold text-primary motion-safe:animate-combo-pop">{t(result === "won" ? "battleOver.won" : "battleOver.lost")}</p>
  <p class="m-0 mt-2 text-lg text-secondary">{t(result === "won" ? "battleOver.wonWhy" : "battleOver.lostWhy")}</p>
</div>
