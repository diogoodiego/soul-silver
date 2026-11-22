<script lang="ts">
  // A move's sheet: its type, category, power, accuracy and PP, as the extraction has them; block C: whether it
  // fights as a normal move or a special one, and a special's cooldown.
  import { isSpecial, specialCooldownS } from "@soulsilver/shared/combat";
  import { TYPE_KEYS, type MoveRecord } from "@soulsilver/shared/game-data";
  import combatTuning from "../../../../content/combat/tuning.json";
  import TypeBadge from "./TypeBadge.svelte";

  let { name, move }: { name: string; move: MoveRecord | undefined } = $props();

  const CATEGORY = { physical: "Físico", special: "Especial", status: "Status" } as const;
  /** Raw power: 0 deals no damage, 1 is worked out in the fight. */
  const power = (p: number) => (p === 0 ? "—" : p === 1 ? "Variável" : String(p));
  // shortcut: fixed-damage moves are told by power 1 here (the server also reads the combat data's damage kind).
  const fight = $derived(
    move === undefined
      ? undefined
      : isSpecial(move)
        ? `Golpe especial: recarga de ${specialCooldownS(combatTuning.value.action.specialCooldown, move.power)} s, só dá para esquivar.`
        : `Golpe normal: encadeia sem recarga (${combatTuning.value.action.normalMissCooldownS} s se errar o primeiro) e pode ser aparado.`,
  );
</script>

<div class="grid gap-2">
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-lg font-bold text-primary">{name}</span>
    {#if move}<TypeBadge type={TYPE_KEYS[move.type] ?? "unknown"} />{/if}
  </div>
  {#if move}
    <dl class="m-0 grid grid-cols-4 gap-2 text-center">
      {#each [["Categoria", CATEGORY[move.category]], ["Poder", power(move.power)], ["Precisão", move.accuracy === null ? "Nunca erra" : `${move.accuracy}%`], ["PP", String(move.pp)]] as [label, value] (label)}
        <div class="grid gap-0.5 rounded-md bg-surface-raised px-2 py-1.5">
          <dt class="text-xs text-tertiary">{label}</dt>
          <dd class="m-0 font-semibold text-primary">{value}</dd>
        </div>
      {/each}
    </dl>
    <p class="m-0 text-sm text-secondary">{fight}</p>
  {/if}
</div>
