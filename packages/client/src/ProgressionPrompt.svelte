<script lang="ts">
  // Progression after a fight (spec 016): one queued item at a time, never during combat (the
  // server only sends them out of it). Level up and a free move slot just need OK; a fifth move asks
  // which to forget; an evolution plays and can be cancelled, as in the original.
  import type { ServerMessage } from "@soulsilver/shared/game";
  import { onMount } from "svelte";

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
  const LABELS: Record<string, string> = { hp: "HP", attack: "Ataque", defense: "Defesa", speed: "Velocidade", specialAttack: "At. Esp.", specialDefense: "Def. Esp." };

  const item = $derived(prompt.item);
  const name = $derived(speciesName(species));
  const full = $derived(item.kind === "learn" && (prompt.moves?.length ?? 0) >= 4);

  let box: HTMLDivElement;
  onMount(() => {
    box.querySelector<HTMLButtonElement>("button")?.focus();
    if (item.kind !== "evolve") return;
    const timer = setTimeout(() => onEvolve(true), EVOLVE_MS);
    return () => clearTimeout(timer);
  });
</script>

<div class="prompt" role="dialog" aria-label="Progresso do Pokémon" bind:this={box}>
  {#if item.kind === "level-up"}
    <p>{name} subiu para o nível {item.level}!</p>
    {#if prompt.stats && prompt.gains}
      <dl>
        {#each Object.keys(LABELS) as k (k)}
          <dt>{LABELS[k]}</dt>
          <dd>{prompt.stats[k as keyof typeof prompt.stats]} (+{prompt.gains[k as keyof typeof prompt.gains]})</dd>
        {/each}
      </dl>
    {/if}
    <button type="button" onclick={onAck}>OK</button>
  {:else if item.kind === "learn" && !full}
    <p>{name} aprendeu {moveName(item.move)}!</p>
    <button type="button" onclick={onAck}>OK</button>
  {:else if item.kind === "learn"}
    <p>{name} quer aprender {moveName(item.move)}, mas já conhece quatro golpes. Qual esquecer?</p>
    {#each prompt.moves ?? [] as move, i (i)}
      <button type="button" onclick={() => onLearn(i)}>Esquecer {moveName(move)}</button>
    {/each}
    <button type="button" onclick={() => onLearn(null)}>Não aprender {moveName(item.move)}</button>
  {:else}
    <p>O quê? {name} está evoluindo!</p>
    <p class="evolving" aria-live="polite"><span>{name}</span><span>{speciesName(item.into)}</span></p>
    <button type="button" onclick={() => onEvolve(false)}>Cancelar evolução</button>
  {/if}
</div>

<style>
  .prompt {
    position: absolute;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    display: grid;
    gap: 0.25rem;
    width: min(90%, 28rem);
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font:
      13px system-ui,
      sans-serif;
  }
  p {
    margin: 0 0 0.25rem;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 1rem;
    margin: 0 0 0.25rem;
  }
  dd {
    margin: 0;
  }
  button {
    text-align: left;
  }
  .evolving {
    position: relative;
    height: 1.5rem;
    font-size: 18px;
    font-weight: bold;
  }
  .evolving span {
    position: absolute;
    animation: blink 0.5s steps(1) infinite;
  }
  .evolving span + span {
    animation-delay: 0.25s;
  }
  @keyframes blink {
    50% {
      visibility: hidden;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .evolving span {
      animation: none;
    }
    .evolving span + span {
      display: none;
    }
  }
</style>
