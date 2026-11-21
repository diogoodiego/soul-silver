<script lang="ts">
  // A move's sheet: its type, category, power, accuracy and PP, as the extraction has them.
  import { TYPE_KEYS, type MoveRecord } from "@soulsilver/shared/game-data";
  import TypeBadge from "./TypeBadge.svelte";

  let { name, move }: { name: string; move: MoveRecord | undefined } = $props();

  const CATEGORY = { physical: "Físico", special: "Especial", status: "Status" } as const;
  /** Raw power: 0 deals no damage, 1 is worked out in the fight. */
  const power = (p: number) => (p === 0 ? "—" : p === 1 ? "Variável" : String(p));
</script>

<div class="grid gap-2">
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-[1.15em] font-bold text-primary">{name}</span>
    {#if move}<TypeBadge type={TYPE_KEYS[move.type] ?? "unknown"} />{/if}
  </div>
  {#if move}
    <dl class="m-0 grid grid-cols-4 gap-2 text-center">
      {#each [["Categoria", CATEGORY[move.category]], ["Poder", power(move.power)], ["Precisão", move.accuracy === null ? "Nunca erra" : `${move.accuracy}%`], ["PP", String(move.pp)]] as [label, value] (label)}
        <div class="grid gap-0.5 rounded-md bg-sunken px-2 py-1.5">
          <dt class="text-[0.75em] text-tertiary">{label}</dt>
          <dd class="m-0 font-semibold text-primary">{value}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</div>
