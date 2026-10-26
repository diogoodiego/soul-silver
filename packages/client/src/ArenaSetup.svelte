<script lang="ts">
  // Dev arena setup (spec 013, US6): any two Pokémon, level and up to 4 moves each, by id.
  import type { ArenaCombatant, ArenaSpec } from "@soulsilver/shared/game";
  import { parseTextFile } from "@soulsilver/shared/text";
  import { onMount } from "svelte";

  let { onStart, onBack, busy }: { onStart: (spec: ArenaSpec) => void; onBack: () => void; busy: boolean } = $props();

  interface Side {
    species: number;
    level: number;
    moves: string;
  }
  // Cyndaquil (Ember, Tackle, SmokeScreen, Quick Attack) against Chikorita (Tackle, Growl, Razor Leaf, Vine Whip).
  let a = $state<Side>({ species: 155, level: 10, moves: "52, 33, 108, 98" });
  let b = $state<Side>({ species: 152, level: 10, moves: "33, 45, 75, 22" });
  let names = $state<{ species: string[]; moves: string[] }>({ species: [], moves: [] });

  async function bank(n: number): Promise<string[]> {
    const file = `${String(n).padStart(4, "0")}.json`;
    try {
      const parsed = parseTextFile("text-bank", await (await fetch(`assets://stages/text-catalog/catalog/en/${file}`)).json(), file);
      return parsed.ok ? parsed.data.records.map((r) => r.text) : [];
    } catch {
      return [];
    }
  }

  onMount(() => {
    void Promise.all([bank(237), bank(750)]).then(([species, moves]) => (names = { species, moves }));
  });

  const moveIds = (text: string) => text.split(/[\s,]+/).filter(Boolean).map(Number);
  const valid = (s: Side) => {
    const ids = moveIds(s.moves);
    return Number.isInteger(s.species) && s.species > 0 && Number.isInteger(s.level) && s.level >= 1 && s.level <= 100 && ids.length >= 1 && ids.length <= 4 && ids.every((m) => Number.isInteger(m) && m > 0);
  };
  const combatant = (s: Side): ArenaCombatant => ({ species: s.species, level: s.level, moves: moveIds(s.moves) });
</script>

<section>
  <h2>Arena de teste (dev)</h2>
  <p>A é seu (teclas 1–4 ou A/X/Y/RB; mira com o mouse ou o analógico direito). B fica parado como alvo selvagem. Nada é salvo.</p>
  {#each [{ label: "A", side: a }, { label: "B", side: b }] as { label, side } (label)}
    <fieldset class="grid gap-1 max-w-[24rem] mb-2">
      <legend>Pokémon {label}</legend>
      <label>Espécie <input class="w-20" type="number" min="1" bind:value={side.species} /> {names.species[side.species] ?? ""}</label>
      <label>Nível <input class="w-20" type="number" min="1" max="100" bind:value={side.level} /></label>
      <label>Golpes (ids) <input type="text" bind:value={side.moves} /></label>
      <small>{moveIds(side.moves).map((m) => names.moves[m] ?? m).join(" · ")}</small>
    </fieldset>
  {/each}
  <div class="flex gap-2">
    <button type="button" disabled={busy || !valid(a) || !valid(b)} onclick={() => onStart({ a: combatant(a), b: combatant(b) })}>Lutar</button>
    <button type="button" onclick={onBack}>Voltar</button>
  </div>
</section>
