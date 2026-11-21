<script lang="ts">
  // The Pokégear clock (spec 026): the session's time and weekday, the same for every player.
  import { t, type MessageKey } from "../i18n";

  let { minuteOfDay, weekday }: { minuteOfDay: number; weekday: number } = $props();
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
</script>

<div class="grid gap-1 place-items-center py-4">
  <p class="m-0 text-4xl tabular-nums">{pad(minuteOfDay / 60)}:{pad(minuteOfDay % 60)}</p>
  <p class="m-0 text-xl">{t(`weekday.${weekday}` as MessageKey)}</p>
</div>
