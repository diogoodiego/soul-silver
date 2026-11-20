<script lang="ts">
  // Dev arena setup: the player's trainer and team (spec 013, US6) against an NPC trainer, with a team of the
  // tester's choosing, or wild Pokémon with no trainer, fighting with the AI or standing still as targets.
  // Block H: laid out as the fight's two sides, you and the opponent, on the game's panel.
  import Button from "../ui/Button.svelte";
  import type { ArenaCombatant, ArenaSpec } from "@soulsilver/shared/game";
  import { parseTextFile } from "@soulsilver/shared/text";
  import { onMount } from "svelte";
  import Glyph from "../ui/Glyph.svelte";
  
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
  /** What is wrong with a team row, in the tester's words; undefined when it can fight. */
  const rowError = (r: Row): string | undefined => {
    const ids = moveIds(r.moves);
    if (!Number.isInteger(r.species) || r.species < 1) return "Escolha uma espécie (número da Pokédex).";
    if (!Number.isInteger(r.level) || r.level < 1 || r.level > 100) return "O nível vai de 1 a 100.";
    if (ids.length < 1 || ids.length > 4) return "Informe de 1 a 4 golpes, separados por vírgula.";
    if (!ids.every((m) => Number.isInteger(m) && m > 0)) return "Golpes são números inteiros, separados por vírgula.";
    return undefined;
  };
  const combatant = (r: Row): ArenaCombatant => ({ species: r.species, level: r.level, moves: moveIds(r.moves) });
  const blocker = $derived(
    name.trim() === ""
      ? "Dê um nome ao seu treinador."
      : [...mine, ...theirs].some((r) => rowError(r))
        ? "Corrija os Pokémon marcados para lutar."
        : foeKind === "trainer" && !(Number.isInteger(trainerId) && trainerId > 0)
          ? "Informe o número do treinador."
          : undefined,
  );

  function start(): void {
    const foe: ArenaSpec["foe"] = foeKind === "wild" ? { kind: "wild", behavior, team: theirs.map(combatant) } : { kind: "trainer", trainer: trainerId, team: theirs.map(combatant) };
    onStart({ trainer: { name: name.trim(), character }, team: mine.map(combatant), foe });
  }

  const field = "w-full border-0 border-b-2 border-dashed border-default bg-transparent px-0 py-1 text-[1em] text-inherit outline-none focus:border-focus";
  const caption = "text-[0.8em] font-semibold text-secondary";
</script>

<!-- A row of pill choices backed by radios, so arrow keys and screen readers treat it as one choice. -->
{#snippet choice<T extends string>(label: string, options: [T, string][], value: T, set: (v: T) => void)}
  <div class="grid gap-1" role="radiogroup" aria-label={label}>
    <span class={caption}>{label}</span>
    <div class="flex flex-wrap gap-1.5">
      {#each options as [v, text] (v)}
        <label class="cursor-pointer rounded-full px-3 py-1 text-[0.9em] font-semibold border border-default has-checked:bg-selected has-checked:text-primary has-focus-visible:outline-2 has-focus-visible:outline-focus text-action-secondary">
          <input class="sr-only" type="radio" name={label} value={v} checked={value === v} onchange={() => set(v)} />
          {text}
        </label>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet team(rows: Row[], label: string)}
  <div class="grid gap-3" role="group" aria-label={label}>
    <span class={caption}>{label} ({rows.length}/{MAX_TEAM})</span>
    {#each rows as row, i (i)}
      {@const error = rowError(row)}
      <div class={["grid gap-2 rounded-lg bg-sunken p-3", error && "outline-1 outline-danger"]}>
        <div class="grid grid-cols-[1fr_5rem] items-end gap-3">
          <label class="grid gap-1">
            <span class={caption}>Espécie (nº)</span>
            <span class="flex items-baseline gap-2">
              <input class={[field, "w-16 shrink-0"]} type="number" min="1" bind:value={row.species} />
              <span class="truncate font-bold">{names.species[row.species] ?? ""}</span>
            </span>
          </label>
          <label class="grid gap-1">
            <span class={caption}>Nível</span>
            <input class={field} type="number" min="1" max="100" bind:value={row.level} />
          </label>
        </div>
        <label class="grid gap-1">
          <span class={caption}>Golpes (nºs, separados por vírgula)</span>
          <input class={field} type="text" bind:value={row.moves} />
        </label>
        {#if moveIds(row.moves).length > 0}
          <ul class="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Golpes">
            {#each moveIds(row.moves) as m, j (j)}<li class="rounded-full bg-raised px-2 py-0.5 text-[0.8em]">{names.moves[m] ?? `#${m}`}</li>{/each}
          </ul>
        {/if}
        {#if error}<p class="m-0 text-[0.85em] text-danger" role="alert">{error}</p>{/if}
        {#if rows.length > 1}<div><Button variant="danger" onclick={() => rows.splice(i, 1)}>Remover</Button></div>{/if}
      </div>
    {/each}
    {#if rows.length < MAX_TEAM}<div><Button onclick={() => rows.push({ ...rows.at(-1)! })}>Adicionar Pokémon</Button></div>{/if}
  </div>
{/snippet}

<section class="mx-auto my-4 grid max-h-[calc(100dvh-2rem)] w-[min(60rem,calc(100%-2rem))] grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl bg-panel shadow-[0_12px_40px_rgb(0_0_0/45%)]">
  <header class="grid gap-1 border-b border-default px-6 py-4">
    <h2 class="m-0 text-[1.4em]">Arena de teste</h2>
    <p class="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-secondary">
      Monte os dois lados e lute. Em campo, <Glyph action="combat" round /> manda o primeiro Pokémon e
      <Glyph action="move1" round /><Glyph action="move2" round /><Glyph action="move3" round /><Glyph action="move4" round /> usam os golpes. Nada é salvo.
    </p>
  </header>

  <div class="scrollbar-clean grid min-h-0 grid-cols-1 gap-x-8 gap-y-6 overflow-y-auto px-6 py-5 md:grid-cols-2">
    <div class="grid content-start gap-4">
      <h3 class="m-0 text-[1.1em]">Você</h3>
      <label class="grid gap-1">
        <span class={caption}>Nome do treinador</span>
        <input class={field} type="text" maxlength="12" bind:value={name} />
      </label>
      {@render choice("Personagem", [["male", "Menino"], ["female", "Menina"]], character, (v) => (character = v))}
      {@render team(mine, "Seu time")}
    </div>

    <div class="grid content-start gap-4 md:border-l md:border-default md:pl-8">
      <h3 class="m-0 text-[1.1em]">Adversário</h3>
      {@render choice("Quem luta", [["wild", "Selvagens"], ["trainer", "Treinador"]], foeKind, (v) => (foeKind = v))}
      {#if foeKind === "wild"}
        {@render choice("Os selvagens", [["ai", "Lutam com a IA"], ["idle", "Ficam parados"]], behavior, (v) => (behavior = v))}
      {:else}
        <div class="grid grid-cols-[5rem_1fr] items-end gap-3">
          <label class="grid gap-1">
            <span class={caption}>Treinador (nº)</span>
            <input class={field} type="number" min="1" bind:value={trainerId} />
          </label>
          <span class="truncate pb-1 font-bold">{names.trainers[trainerId] ?? ""}</span>
        </div>
        <div>
          <Button disabled={!originals.has(trainerId)} onclick={() => (theirs = (originals.get(trainerId) ?? []).map((r) => ({ ...r })))}>Usar o time original</Button>
        </div>
      {/if}
      {@render team(theirs, foeKind === "wild" ? "Pokémon selvagens" : "Time do treinador")}
    </div>
  </div>

  <footer class="flex flex-wrap items-center justify-end gap-3 border-t border-default px-6 py-3">
    {#if blocker}<p class="m-0 mr-auto text-[0.9em] text-danger" role="status">{blocker}</p>{/if}
    <Button onclick={onBack}>Voltar</Button>
    <Button variant="primary" disabled={busy || blocker !== undefined} onclick={start}>Lutar</Button>
  </footer>
</section>
