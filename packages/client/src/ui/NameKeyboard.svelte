<script lang="ts">
  // On-screen letters for typing a name with the pad alone (spec 017, FR-018), like the original's naming screen.
  import Button from "./Button.svelte";
  import { t } from "../i18n";

  let { value, max, onChange }: { value: string; max: number; onChange: (value: string) => void } = $props();

  let upper = $state(true);
  const letters = $derived([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c) => (upper ? c : c.toLowerCase())));
  const DIGITS = [..."0123456789"];

  const add = (c: string) => {
    if (value.length < max) onChange(value + c);
  };
</script>

<div class="grid grid-cols-[repeat(10,2.4rem)] gap-1" role="group" aria-label={t("newGame.keyboard")}>
  {#each [...letters, ...DIGITS] as c (c)}
    <Button onclick={() => add(c)}>{c}</Button>
  {/each}
  <Button class="col-span-3" onclick={() => add(" ")}>{t("newGame.space")}</Button>
  <Button class="col-span-3" onclick={() => (upper = !upper)}>{upper ? "abc" : "ABC"}</Button>
  <Button class="col-span-3" onclick={() => onChange(value.slice(0, -1))}>⌫</Button>
</div>
