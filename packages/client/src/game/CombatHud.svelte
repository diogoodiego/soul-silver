<script lang="ts">
  // Combat HUD (spec 017, US3): an HP and action bar over each foe. Block H: the controlled Pokémon's HP,
  // status and action bar live in the team's lead card (PartyStrip), and the trainer's call-out stacks with
  // the moves in the bottom-left column.
  import HpBar from "../ui/HpBar.svelte";

  let {
    bars,
  }: {
    /** HP and action bars over the foes (wild and other players'), in screen pixels; `gauge` from 0 to 1; `scared` while a stat stage is lowered. */
    bars: { key: string; x: number; y: number; fraction: number; gauge: number; scared: boolean }[];
  } = $props();
</script>

{#each bars as b (b.key)}
  <span class="absolute w-14 -translate-x-1/2 -translate-y-full pointer-events-none z-1" style="left: {b.x}px; top: {b.y}px" aria-hidden="true">
    <HpBar fraction={b.fraction} />
    <span class="block h-[0.25rem] mt-px bg-surface-raised rounded-[2px] overflow-hidden"><span class="block h-full bg-[#4fc3f7]" style:width="{b.gauge * 100}%"></span></span>
    {#if b.scared}<span class="absolute left-full top-1/2 ml-1 -translate-y-1/2 text-sm leading-none">😨</span>{/if}
  </span>
{/each}
