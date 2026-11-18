<script lang="ts">
  // A main-menu option: plain text, a white pill with the confirm button's glyph while focused.
  import Glyph from "./Glyph.svelte";

  let { label, onclick, disabled = false }: { label: string; onclick: () => void; disabled?: boolean } = $props();
</script>

<button
  type="button"
  class="group flex items-center gap-2 border-0 rounded-full bg-transparent p-1.5 pe-4 text-[1.15rem] font-semibold text-zinc-200 outline-none focus:bg-white focus:text-ink disabled:opacity-40 disabled:cursor-default"
  {disabled}
  {onclick}
>
  <span class="hidden group-focus:inline-flex"><Glyph action="confirm" round /></span>
  {label}
</button>
