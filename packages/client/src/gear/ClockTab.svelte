<script lang="ts">
  // The Pokégear clock (spec 026): the session's time and weekday, the same for every player.
  // The host picks the time the game runs from; guests only see it.
  import Button from "../ui/Button.svelte";
  import Caption from "../ui/Caption.svelte";
  import SelectField from "../ui/SelectField.svelte";
  import { t, type MessageKey } from "../i18n";

  let { minuteOfDay, weekday, canSet, onSet }: { minuteOfDay: number; weekday: number; canSet: boolean; onSet: (minuteOfDay: number | null) => void } = $props();
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");

  const HOURS = Array.from({ length: 24 }, (_, h): [number, string] => [h, pad(h)]);
  const MINUTES = Array.from({ length: 12 }, (_, i): [number, string] => [i * 5, pad(i * 5)]);
  let hour = $state(0);
  let minute = $state(0);
</script>

<div class="grid gap-1 place-items-center py-4">
  <p class="m-0 text-4xl tabular-nums">{pad(minuteOfDay / 60)}:{pad(minuteOfDay % 60)}</p>
  <p class="m-0 text-xl">{t(`weekday.${weekday}` as MessageKey)}</p>
</div>
{#if canSet}
  <div class="flex flex-wrap gap-2 items-end">
    <SelectField label={t("gear.clockHour")} options={HOURS} bind:value={hour} />
    <SelectField label={t("gear.clockMinute")} options={MINUTES} bind:value={minute} />
    <Button variant="primary" onclick={() => onSet(hour * 60 + minute)}>{t("gear.clockApply")}</Button>
    <Button variant="ghost" onclick={() => onSet(null)}>{t("gear.clockReset")}</Button>
  </div>
{:else}
  <Caption>{t("gear.clockHostOnly")}</Caption>
{/if}
