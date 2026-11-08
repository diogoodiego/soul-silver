<script lang="ts">
  import { t } from "../i18n";

  // Spec 026: the Pokégear's call banner. The lines play in the dialog box under it; the session hangs up once they end.
  let { name, direction }: { name: string; direction: "in" | "out" } = $props();
</script>

<div class="absolute top-3 left-1/2 z-5 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-[#1d2a44]/90 text-[#eef] shadow" role="status">
  <span aria-hidden="true">☎</span>
  <span>{t(direction === "in" ? "phone.incoming" : "phone.outgoing", { name })}</span>
</div>
