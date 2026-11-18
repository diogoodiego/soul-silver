<script lang="ts">
  // Dev arena setup: the player's trainer and team (spec 013, US6) against an NPC trainer, with a team of the
  // tester's choosing, or wild Pokémon with no trainer, fighting with the AI or standing still as targets.
  import type { ArenaCombatant, ArenaSpec } from "@soulsilver/shared/game";
  import { parseTextFile } from "@soulsilver/shared/text";
  import { onMount } from "svelte";

  let { onStart, onBack, busy }: { onStart: (spec: ArenaSpec) => void; onBack: () => void; busy: boolean } = $props();

  interface Row {
    species: number;
    level: number;
    moves: string;
  }
  const MAX_TEAM = 6;

  let name = $state("Teste");
  let character = $state<"male" | "female">("male");
  // Cyndaquil (Ember, Tackle, SmokeScreen, Quick Attack) against Chikorita (Tackle, Growl, Razor Leaf, Vine Whip).
  let mine = $state<Row[]>([{ species: 155, level: 10, moves: "52, 33, 108, 98" }]);
  let foeKind = $state<"trainer" | "wild">("wild");
  let behavior = $state<"ai" | "idle">("ai");
  // Falkner.
  let trainerId = $state(20);
  let theirs = $state<Row[]>([{ species: 152, level: 10, moves: "33, 45, 75, 22" }]);
  let names = $state<{ species: string[]; moves: string[]; trainers: string[] }>({ species: [], moves: [], trainers: [] });
  let originals = $state<Map<number, Row[]>>(new Map());

  async function json(path: string): Promise<unknown> {
    try {
      return await (await fetch(`assets://stages/${path}`)).json();
    } catch {
      return undefined;
    }
  }

  async function bank(n: number): Promise<string[]> {
    const file = `${String(n).padStart(4, "0")}.json`;
    const parsed = parseTextFile("text-bank", await json(`text-catalog/catalog/en/${file}`), file);
    return parsed.ok ? parsed.data.records.map((r) => r.text) : [];
  }

  onMount(() => {
    void Promise.all([bank(237), bank(750), bank(729)]).then(([species, moves, trainers]) => (names = { species, moves, trainers }));
    // The extraction's trainers, for their names and original teams; moves left to the level are left for the tester.
    void json("events/events/trainers.json").then((file) => {
      const records = (file as { records?: { id: number; team: { species: number; level: number; moves: number[] | null }[] }[] } | undefined)?.records ?? [];
      originals = new Map(records.map((t) => [t.id, t.team.map((m) => ({ species: m.species, level: m.level, moves: (m.moves ?? []).filter((id) => id > 0).join(", ") }))]));
    });
  });

  const moveIds = (text: string) => text.split(/[\s,]+/).filter(Boolean).map(Number);
  const validRow = (r: Row) => {
    const ids = moveIds(r.moves);
    return Number.isInteger(r.species) && r.species > 0 && Number.isInteger(r.level) && r.level >= 1 && r.level <= 100 && ids.length >= 1 && ids.length <= 4 && ids.every((m) => Number.isInteger(m) && m > 0);
  };
  const combatant = (r: Row): ArenaCombatant => ({ species: r.species, level: r.level, moves: moveIds(r.moves) });
  const valid = $derived(name.trim() !== "" && mine.every(validRow) && theirs.every(validRow) && (foeKind === "wild" || (Number.isInteger(trainerId) && trainerId > 0)));

  function start(): void {
    const foe: ArenaSpec["foe"] = foeKind === "wild" ? { kind: "wild", behavior, team: theirs.map(combatant) } : { kind: "trainer", trainer: trainerId, team: theirs.map(combatant) };
    onStart({ trainer: { name: name.trim(), character }, team: mine.map(combatant), foe });
  }
</script>

{#snippet team(rows: Row[], label: string)}
  <fieldset class="grid gap-1 max-w-[30rem] mb-2">
    <legend>{label}</legend>
    {#each rows as row, i (i)}
      <div class="grid gap-1 border-b border-white/20 pb-1">
        <label>Espécie <input class="w-20" type="number" min="1" bind:value={row.species} /> {names.species[row.species] ?? ""}</label>
        <label>Nível <input class="w-20" type="number" min="1" max="100" bind:value={row.level} /></label>
        <label>Golpes (ids) <input type="text" bind:value={row.moves} /></label>
        <small>{moveIds(row.moves).map((m) => names.moves[m] ?? m).join(" · ")}</small>
        {#if rows.length > 1}<button type="button" class="justify-self-start" onclick={() => rows.splice(i, 1)}>Remover</button>{/if}
      </div>
    {/each}
    {#if rows.length < MAX_TEAM}<button type="button" class="justify-self-start" onclick={() => rows.push({ ...rows.at(-1)! })}>Adicionar Pokémon</button>{/if}
  </fieldset>
{/snippet}

<section>
  <h2>Arena de teste</h2>
  <p>Seu treinador entra no campo com o time abaixo; F manda o primeiro Pokémon lutar (teclas 1–4 para os golpes). Nada é salvo.</p>
  <fieldset class="grid gap-1 max-w-[30rem] mb-2">
    <legend>Seu treinador</legend>
    <label>Nome <input type="text" maxlength="12" bind:value={name} /></label>
    <div class="flex gap-3">
      <label><input type="radio" value="male" bind:group={character} /> Menino</label>
      <label><input type="radio" value="female" bind:group={character} /> Menina</label>
    </div>
  </fieldset>
  {@render team(mine, "Seu time")}

  <fieldset class="grid gap-1 max-w-[30rem] mb-2">
    <legend>Adversário</legend>
    <div class="flex gap-3">
      <label><input type="radio" value="trainer" bind:group={foeKind} /> Treinador (NPC)</label>
      <label><input type="radio" value="wild" bind:group={foeKind} /> Selvagens, sem treinador</label>
    </div>
    <label>
      Treinador (id)
      <input class="w-20" type="number" min="1" disabled={foeKind === "wild"} bind:value={trainerId} />
      {foeKind === "trainer" ? (names.trainers[trainerId] ?? "") : ""}
    </label>
    <button type="button" class="justify-self-start" disabled={foeKind === "wild" || !originals.has(trainerId)} onclick={() => (theirs = (originals.get(trainerId) ?? []).map((r) => ({ ...r })))}>Usar o time original</button>
    <label>
      Selvagens
      <select disabled={foeKind === "trainer"} bind:value={behavior}>
        <option value="ai">lutam com a IA</option>
        <option value="idle">ficam parados como alvo</option>
      </select>
    </label>
  </fieldset>
  {@render team(theirs, foeKind === "wild" ? "Pokémon selvagens" : "Time do treinador")}

  <div class="flex gap-2">
    <button type="button" disabled={busy || !valid} onclick={start}>Lutar</button>
    <button type="button" onclick={onBack}>Voltar</button>
  </div>
</section>
