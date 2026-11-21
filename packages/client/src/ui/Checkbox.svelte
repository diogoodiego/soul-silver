<script lang="ts">
  // A check box drawn in the current text colour, so it reads on a plain row and on the lit (focused) one.
  // Visual only: the row around it (DexRow) is the button and carries aria-pressed.
  let { checked }: { checked: boolean } = $props();
</script>

<span class="inline-flex size-4 items-center justify-center rounded-sm border-2 border-solid border-current align-middle" aria-hidden="true">
  {#if checked}<span class="size-2 rounded-[1px] bg-current"></span>{/if}
</span>
