<script lang="ts">
  // Progression after a fight (spec 016): one queued item at a time, never during combat (the
  // server only sends them out of it). Level up and a free move slot just need OK; a fifth move asks
  // which to forget; an evolution plays and can be cancelled, as in the original.
  import Button from "../ui/Button.svelte";
  import type { ServerMessage } from "@soulsilver/shared/game";
  import { onMount } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";

  type Prompt = Extract<ServerMessage, { type: "progression" }>;

  let {
    prompt,
    species,
    speciesName,
    moveName,
    onAck,
    onLearn,
    onEvolve,
  }: {
    prompt: Prompt;
    /** Species of the member the item is about. */
    species: number;
    speciesName: (species: number) => string;
    moveName: (move: number) => string;
    onAck: () => void;
    /** The slot to forget, or null to keep the four moves. */
    onLearn: (forget: number | null) => void;
    onEvolve: (accept: boolean) => void;
  } = $props();

  /** How long the evolution plays before it completes on its own. */
  const EVOLVE_MS = 3000;
  const STATS = ["hp", "attack", "defense", "speed", "specialAttack", "specialDefense"] as const;

  const item = $derived(prompt.item);
  const name = $derived(speciesName(species));
  const full = $derived(item.kind === "learn" && (prompt.moves?.length ?? 0) >= 4);

  onMount(() => {
    if (item.kind !== "evolve") return;
    const timer = setTimeout(() => onEvolve(true), EVOLVE_MS);
    return () => clearTimeout(timer);
  });
</script>

<div class="absolute left-1/2 bottom-4 -translate-x-1/2 grid gap-1 w-[min(90%,28rem)] p-3 bg-overlay text-primary text-[13px]" role="dialog" aria-label={t("progress.label")} use:menu>
  {#if item.kind === "level-up"}
    <p class="mt-0 mb-1">{t("progress.levelUp", { name, level: item.level })}</p>
    {#if prompt.stats && prompt.gains}
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0 mt-0 mb-1">
        {#each STATS as k (k)}
          <dt>{t(`stat.${k}`)}</dt>
          <dd class="m-0">{prompt.stats[k]} (+{prompt.gains[k]})</dd>
        {/each}
      </dl>
    {/if}
    <Button variant="ghost" class="text-left" onclick={onAck}>{t("common.ok")}</Button>
  {:else if item.kind === "learn" && !full}
    <p class="mt-0 mb-1">{t("progress.learned", { name, move: moveName(item.move) })}</p>
    <Button variant="ghost" class="text-left" onclick={onAck}>{t("common.ok")}</Button>
  {:else if item.kind === "learn"}
    <p class="mt-0 mb-1">{t("progress.wantsToLearn", { name, move: moveName(item.move) })}</p>
    {#each prompt.moves ?? [] as move, i (i)}
      <Button variant="ghost" class="text-left" onclick={() => onLearn(i)}>{t("progress.forget", { move: moveName(move) })}</Button>
    {/each}
    <Button variant="ghost" class="text-left" onclick={() => onLearn(null)}>{t("progress.dontLearn", { move: moveName(item.move) })}</Button>
  {:else}
    <p class="mt-0 mb-1">{t("progress.evolving", { name })}</p>
    <p class="relative h-6 mt-0 mb-1 text-[18px] font-bold" aria-live="polite"><span class="absolute animate-blink motion-reduce:animate-none">{name}</span><span class="absolute animate-blink [animation-delay:0.25s] motion-reduce:hidden">{speciesName(item.into)}</span></p>
    <Button variant="ghost" class="text-left" onclick={() => onEvolve(false)}>{t("progress.cancelEvolution")}</Button>
  {/if}
</div>
