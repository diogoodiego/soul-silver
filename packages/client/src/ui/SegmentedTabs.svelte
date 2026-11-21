<script lang="ts">
  // A few options side by side, the current one filled, in the current text colour. Visual only:
  // the row around it steps the choice with left/right (a button cannot hold buttons).
  let { options, current }: { options: string[]; current: string } = $props();
</script>

<span class="inline-flex overflow-hidden rounded-md border border-solid border-current align-middle text-sm">
  {#each options as option, i (i)}
    <span class={["px-2.5 py-0.5", option === current ? "bg-current/25 font-bold" : "opacity-60", i > 0 && "border-0 border-l border-solid border-current"]}>{option}</span>
  {/each}
</span>
