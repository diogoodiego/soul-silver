<script lang="ts">
  // Quick swap (spec 014, US3): the only menu in combat. Opens with the picker action or when the
  // Pokémon out faints; lists the party in its own order (swapping never reorders it).
  import { onMount } from "svelte";

  interface Member {
    species: number;
    level: number;
    hp: number;
    hpMax: number;
  }

  let {
    members,
    active,
    fainted,
    speciesName,
    onPick,
    onRecall,
    onClose,
  }: {
    members: Member[];
    active: number | undefined;
    /** Opened because the Pokémon out fainted: there is nothing to close back to. */
    fainted: boolean;
    speciesName: (species: number) => string;
    onPick: (index: number) => void;
    onRecall: () => void;
    onClose: () => void;
  } = $props();

  let list: HTMLDivElement;
  onMount(() => list.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
</script>

<div class="picker" role="dialog" aria-label="Trocar Pokémon" bind:this={list}>
  <p>{fainted ? "Seu Pokémon desmaiou. Escolha o próximo ou recolha para fugir." : "Trocar Pokémon"}</p>
  {#each members as m, i (i)}
    <button type="button" disabled={m.hp === 0 || i === active} onclick={() => onPick(i)}>
      {speciesName(m.species)} · nv {m.level} · HP {m.hp}/{m.hpMax}{i === active ? " · em campo" : ""}{m.hp === 0 ? " · desmaiado" : ""}
    </button>
  {/each}
  <button type="button" onclick={onRecall}>Recolher e fugir</button>
  {#if !fainted}<button type="button" onclick={onClose}>Voltar à luta</button>{/if}
</div>

<style>
  .picker {
    position: absolute;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    display: grid;
    gap: 0.25rem;
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
  button {
    text-align: left;
  }
</style>
