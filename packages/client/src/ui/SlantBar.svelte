<script lang="ts">
  // A 0–100 level as slanted cells (one per step, 20 by default), filled up to the value, in the current text colour. Visual only.
  let { value, cells = 20 }: { value: number; cells?: number } = $props();
  const filled = $derived(Math.round((value / 100) * cells));
</script>

<span class="inline-flex items-center gap-0.5 align-middle" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
  {#each { length: cells }, i (i)}
    <span class={["h-3 w-1.5 -skew-x-[20deg] border border-solid border-current", i < filled ? "bg-current" : "opacity-40"]}></span>
  {/each}
  <span class="ml-2 inline-block w-[4ch] text-right">{value}%</span>
</span>
