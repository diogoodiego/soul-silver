<script lang="ts">
  // A Pokédex-screen row with a counter: label left, then the price and the count. Confirm (a click) adds one up to
  // `max`; left and right step it down and up (the screen reads data-adjust off the focused row and calls `onChange`).
  import DexRow from "./DexRow.svelte";

  let {
    label,
    price,
    count,
    max,
    onChange,
    onfocus,
  }: {
    label: string;
    price: string;
    count: number;
    max: number;
    onChange: (count: number) => void;
    onfocus?: (() => void) | undefined;
  } = $props();
</script>

<DexRow {label} adjustable onclick={() => onChange(Math.min(max, count + 1))} {onfocus}>
  <span class="inline-flex items-center gap-4">
    <span>{price}</span>
    <span class={["inline-flex w-[6ch] justify-between", count === 0 && "opacity-40"]}><span aria-hidden="true">‹</span>{count}<span aria-hidden="true">›</span></span>
  </span>
</DexRow>
