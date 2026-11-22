<script lang="ts">
  // One row per status: its bar filling as hits build it up, or full with the label lit while the status is active.
  import { STATUS_IDS, statusesOf } from "@soulsilver/shared/combat";
  import type { EntityData } from "@soulsilver/shared/game";
  import { t } from "../i18n";
  import { STATUS_COLORS } from "./type-colors";

  let { data }: { data: EntityData } = $props();

  const rows = $derived.by(() => {
    const active = statusesOf(data);
    return STATUS_IDS.flatMap((id) => {
      const on = active.includes(id);
      const percent = on ? 100 : Number(data[`bld_${id}`] ?? 0);
      return percent > 0 ? [{ id, on, percent }] : [];
    });
  });
</script>

{#each rows as r (r.id)}
  <span class={["flex items-center gap-1 text-xs leading-none text-primary [text-shadow:0_1px_2px_#000]", !r.on && "opacity-80"]}>
    <span class={["w-9 shrink-0", r.on && "font-bold"]}>{t(`status.${r.id}`)}</span>
    <span class="block h-1 grow overflow-hidden rounded-[3px] bg-surface-raised" role="meter" aria-label={t(`status.${r.id}`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.percent)}>
      <span class="block h-full [transition:width_0.2s]" style:width="{r.percent}%" style:background={STATUS_COLORS[r.id]}></span>
    </span>
  </span>
{/each}
