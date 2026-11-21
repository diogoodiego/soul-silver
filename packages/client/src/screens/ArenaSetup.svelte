<script lang="ts">
  // Dev arena setup: the player's trainer and team (spec 013, US6) against an NPC trainer, with a team of the
  // tester's choosing, or wild Pokémon with no trainer, fighting with the AI or standing still as targets.
  // Block H: a menu at the right edge, as the other menus: three cards (scene, you, the opponent) sum up the
  // fight and confirm opens the one in focus beside them to edit; Fight comes last, back leaves.
  import Button from "../ui/Button.svelte";
  import type { ArenaCombatant, ArenaSpec } from "@soulsilver/shared/game";
  import type { Action } from "@soulsilver/shared/input";
  import { parseTextFile } from "@soulsilver/shared/text";
  import { onMount, tick } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import Card from "../ui/Card.svelte";
  import Caption from "../ui/Caption.svelte";
  import ChoiceGroup from "../ui/ChoiceGroup.svelte";
  import ErrorText from "../ui/ErrorText.svelte";
  import Glyph from "../ui/Glyph.svelte";
  import KeyHints from "../ui/KeyHints.svelte";
  import MenuCard from "../ui/MenuCard.svelte";
  import Panel from "../ui/Panel.svelte";
  import SelectField from "../ui/SelectField.svelte";
  import TextField from "../ui/TextField.svelte";
  import { TYPE_KEYS, type MoveRecord } from "@soulsilver/shared/game-data";
  import { moveRecords, pokemonFronts, speciesTypes, trainerSprites } from "../game/game-data";
  import PokemonIcon from "../game/PokemonIcon.svelte";
  import MoveSheet from "../ui/MoveSheet.svelte";
  import RingPreview from "../ui/RingPreview.svelte";
  import Sprite from "../ui/Sprite.svelte";
  import TypeBadge from "../ui/TypeBadge.svelte";

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
  /** Each trainer's name and class (its class id is its battle sprite), for the trainer picker. */
  let trainerInfo = $state<Map<number, { name: string; pic: number; className: string }>>(new Map());
  let moveData = $state<Map<number, MoveRecord>>(new Map());
  let typesOf = $state<Map<number, string[]>>(new Map());
  /** Protocol 39: the indoor map whose ring (item V.3) the fight is in; undefined, the open field. */
  let ring = $state<number | undefined>();
  /** The extraction's indoor maps, as "place (map n)". */
  let rings = $state<[number, string][]>([]);

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
    void Promise.all([json("maps/maps/map-headers.json"), bank(279)]).then(([file, places]) => {
      const records = (file as { records?: { id: number; mapsec: number; areaType: string }[] } | undefined)?.records ?? [];
      rings = records.filter((h) => h.areaType === "indoor").map((h) => [h.id, `${places[h.mapsec] ?? "?"} (mapa ${h.id})`]);
      // Starts on a building rather than the open field; the "Mystery Zone" maps are unused ones.
      ring ??= (rings.find(([, place]) => !place.startsWith("Mystery Zone")) ?? rings[0])?.[0];
    });
    void moveRecords().then((m) => (moveData = m));
    void speciesTypes().then((m) => (typesOf = m));
    // The extraction's trainers, for their names and original teams; moves left to the level are left for the tester.
    void json("events/events/trainers.json").then((file) => {
      const records = (file as { records?: { id: number; name: string; class: { id: number; text: string }; team: { species: number; level: number; moves: number[] | null }[] }[] } | undefined)?.records ?? [];
      trainerInfo = new Map(records.map((t) => [t.id, { name: t.name, pic: t.class.id, className: t.class.text }]));
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
  /** Real entries of a name bank: index 0 and the "-----" fillers are no species or move. */
  const optionsOf = (bankNames: string[]): [number, string][] => bankNames.flatMap((n, i) => (i > 0 && n.trim() !== "" && !/^-+$/.test(n.trim()) ? [[i, n] as [number, string]] : []));
  const speciesOptions = $derived(optionsOf(names.species));
  const moveOptions = $derived(optionsOf(names.moves));
  const trainerOptions = $derived([...trainerInfo].map(([id, info]): [number, string] => [id, `${info.name} · ${info.className}`]));
  const frontOf = (species: number) => pokemonFronts().then((m) => m.get(species));
  const trainerFrame = (pic: number) => trainerSprites().then((m) => m.get(pic));
  const moveType = (id: number) => {
    const move = moveData.get(id);
    return move ? (TYPE_KEYS[move.type] ?? "unknown") : "unknown";
  };
  /** Move slot `slot` of a team row set to `id`; 0 empties it, and the later ones move up. */
  function setMove(row: Row, slot: number, id: number): void {
    const ids = moveIds(row.moves);
    if (id > 0) ids[slot] = id;
    else ids.splice(slot, 1);
    row.moves = ids.filter((m) => m > 0).join(", ");
  }
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

  /** The card being edited; its fields open beside the cards. */
  type Section = "scene" | "player" | "foe";
  let editing = $state<Section | undefined>();
  const cards: Record<Section, HTMLButtonElement | undefined> = { scene: undefined, player: undefined, foe: undefined };
  const TITLES: Record<Section, string> = { scene: "Cenário", player: "Você", foe: "Adversário" };

  /** Back from the fields: the focus returns to their card. */
  async function closeEditor(): Promise<void> {
    const was = editing;
    editing = undefined;
    await tick();
    if (was) cards[was]?.focus();
  }

  const sceneName = $derived(ring === undefined ? "Campo aberto" : (rings.find(([id]) => id === ring)?.[1] ?? `Mapa ${ring}`));
  const teamLine = (rows: Row[]) => rows.map((r) => `${names.species[r.species] ?? `#${r.species}`} Nv ${r.level}`).join(", ");
  const playerError = $derived(name.trim() === "" ? "Dê um nome ao seu treinador." : mine.some((r) => rowError(r)) ? "Corrija os Pokémon marcados." : undefined);
  const foeError = $derived(
    theirs.some((r) => rowError(r)) ? "Corrija os Pokémon marcados." : foeKind === "trainer" && !(Number.isInteger(trainerId) && trainerId > 0) ? "Informe o número do treinador." : undefined,
  );

  const hints = [
    { actions: ["confirm" as const], label: t("hints.select") },
    { actions: ["cancel" as const], label: t("hints.back") },
    { actions: ["up" as const, "down" as const], label: t("hints.navigate") },
  ];

  // The open editor's shortcuts, as the save slots' (X, Y, View, RB, LT, RT on the pad).
  const SAVE: Action = "move2";
  const TOGGLE: Action = "move3";
  const REMOVE: Action = "picker";
  const COPY: Action = "tabNext";
  const UP: Action = "combat";
  const DOWN: Action = "recall";

  /** The team in the open editor, and the member whose card has the focus there. */
  const rowsOf = (side: "mine" | "theirs") => (side === "mine" ? mine : theirs);
  const teamSide = $derived(editing === "player" ? "mine" : editing === "foe" ? "theirs" : undefined);
  let current = $state<number | undefined>();
  /** The member whose fields are open over the editor. */
  let member = $state<{ side: "mine" | "theirs"; index: number } | undefined>();
  let editorEl = $state<HTMLElement>();

  /** The team index a focused element stands for: a member's card, or nothing. */
  const memberOf = (target: EventTarget | null): number | undefined => {
    const at = (target as HTMLElement | null)?.dataset["member"];
    return at === undefined ? undefined : Number(at);
  };

  async function focusMember(index: number): Promise<void> {
    await tick();
    editorEl?.querySelector<HTMLButtonElement>(`[data-member="${index}"]`)?.focus();
  }
  function duplicate(rows: Row[], i: number): void {
    if (rows.length >= MAX_TEAM) return;
    rows.splice(i + 1, 0, { ...rows[i]! });
    void focusMember(i + 1);
  }
  /** Up or down the team order; the first one is sent out first. */
  function shift(rows: Row[], i: number, by: -1 | 1): void {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    void focusMember(j);
  }
  function remove(rows: Row[], i: number): void {
    if (rows.length <= 1) return;
    rows.splice(i, 1);
    void focusMember(Math.min(i, rows.length - 1));
  }
  async function closeMember(): Promise<void> {
    const was = member;
    member = undefined;
    if (was) await focusMember(was.index);
  }

  function editorAction(action: Action): boolean {
    if (action === SAVE) return (void closeEditor(), true);
    if (action === TOGGLE && editing === "player") return ((character = character === "male" ? "female" : "male"), true);
    if (teamSide === undefined || current === undefined) return false;
    const rows = rowsOf(teamSide);
    if (action === COPY) duplicate(rows, current);
    else if (action === UP) shift(rows, current, -1);
    else if (action === DOWN) shift(rows, current, 1);
    // Remove is held, not pressed: its hold Button watches the action.
    else if (action !== REMOVE) return false;
    return true;
  }

  function start(): void {
    const foe: ArenaSpec["foe"] = foeKind === "wild" ? { kind: "wild", behavior, team: theirs.map(combatant) } : { kind: "trainer", trainer: trainerId, team: theirs.map(combatant) };
    onStart({ trainer: { name: name.trim(), character }, team: mine.map(combatant), foe, ...(ring !== undefined ? { ring } : {}) });
  }

</script>

{#snippet speciesRow(id: number, text: string)}
  <PokemonIcon species={id} /><span class="tabular-nums text-tertiary">#{id}</span><span class="truncate">{text}</span>
{/snippet}

{#snippet speciesPreview(id: number)}
  <div class="grid justify-items-center gap-2">
    <Sprite frame={frontOf(id)} scale={2} label={names.species[id] ?? ""} />
    <span class="text-[1.2em] font-bold text-primary">#{id} {names.species[id] ?? ""}</span>
    <span class="flex gap-1">{#each typesOf.get(id) ?? [] as type (type)}<TypeBadge type={type as never} />{/each}</span>
  </div>
{/snippet}

{#snippet moveRow(id: number, text: string)}
  {#if id > 0}<TypeBadge type={moveType(id)} />{/if}<span class="truncate">{text}</span>
{/snippet}

{#snippet movePreview(id: number)}
  {#if id > 0}
    <MoveSheet name={names.moves[id] ?? `#${id}`} move={moveData.get(id)} />
    {@const user = member ? rowsOf(member.side)[member.index] : undefined}
    <RingPreview {ring} move={id} user={user && frontOf(user.species)} />
  {:else}
    <span class="text-secondary">Sem golpe neste espaço.</span>
  {/if}
{/snippet}

{#snippet trainerPreview(id: number)}
  {@const info = trainerInfo.get(id)}
  <div class="grid justify-items-center gap-2">
    {#if info}<Sprite frame={trainerFrame(info.pic)} scale={1.5} label={info.name} />{/if}
    <span class="text-[1.2em] font-bold text-primary">{info?.name ?? `nº ${id}`}</span>
    <span class="text-secondary">{info?.className ?? ""}</span>
    <span class="flex flex-wrap justify-center gap-1">{#each originals.get(id) ?? [] as m, j (j)}<PokemonIcon species={m.species} />{/each}</span>
  </div>
{/snippet}

{#snippet ringPreview(id: number | undefined)}
  <RingPreview ring={id} />
  <span class="text-center text-secondary">{id === undefined ? "Campo aberto" : (rings.find(([r]) => r === id)?.[1] ?? `Mapa ${id}`)}</span>
{/snippet}

{#snippet shortcut(i: number, action: Action, label: string, onclick: () => void, disabled: boolean)}
  <Button tabindex={-1} {disabled} {onclick}>
    <span class="inline-flex items-center gap-1">{#if current === i && !member}<Glyph {action} round />{/if}{label}</span>
  </Button>
{/snippet}

{#snippet team(side: "mine" | "theirs", label: string)}
  {@const rows = rowsOf(side)}
  <div class="grid gap-3" role="group" aria-label={label}>
    <Caption>{label} ({rows.length}/{MAX_TEAM})</Caption>
    <ul class="m-0 grid list-none gap-3 p-0">
      {#each rows as row, i (i)}
        {@const error = rowError(row)}
        <li class="grid gap-1.5">
          <MenuCard title={`${names.species[row.species] ?? `#${row.species}`} · Nv ${row.level}`} data-member={i} onclick={() => (member = { side, index: i })}>
            {#snippet media()}<Sprite frame={frontOf(row.species)} scale={0.75} />{/snippet}
            <span class="flex flex-wrap items-center gap-1">{#each moveIds(row.moves) as m, j (j)}<TypeBadge type={moveType(m)} /><span class="mr-1.5">{names.moves[m] ?? `#${m}`}</span>{/each}</span>
            {#if error}<ErrorText role="status">{error}</ErrorText>{/if}
          </MenuCard>
          <div class="flex flex-wrap gap-1.5">
            {#if rows.length > 1}<Button variant="danger" hold={{ action: REMOVE, armed: current === i && !member, onHeld: () => remove(rows, i) }}>Remover</Button>{/if}
            {@render shortcut(i, COPY, "Duplicar", () => duplicate(rows, i), rows.length >= MAX_TEAM)}
            {@render shortcut(i, UP, "Subir", () => shift(rows, i, -1), i === 0)}
            {@render shortcut(i, DOWN, "Descer", () => shift(rows, i, 1), i === rows.length - 1)}
          </div>
        </li>
      {/each}
    </ul>
    <!-- A card like the members', so the pad shows when it is on it. -->
    {#if rows.length < MAX_TEAM}
      <MenuCard title="Adicionar Pokémon" onclick={() => duplicate(rows, rows.length - 1)}>
        {#snippet icon()}
          <svg viewBox="0 0 24 24" class="size-full" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
        {/snippet}
      </MenuCard>
    {/if}
  </div>
{/snippet}

<!-- The menus' place: right edge, vertically centred, over the title backdrop; the open card's fields to its left. -->
<section class="fixed inset-0 flex items-center justify-end gap-6 pr-12" aria-label="Arena de teste" use:menu={{ onBack }}>
  {#if editing}
    <div class="contents" bind:this={editorEl} use:menu={{ onBack: () => void closeEditor(), onAction: editorAction }} onfocusin={(event) => (current = memberOf(event.target))}>
      <Panel title={TITLES[editing]} class="max-h-[calc(100dvh-4rem)] w-[min(36rem,calc(100vw-30rem))]">
        <div class="grid content-start gap-4">
          {#if editing === "scene"}
            <SelectField label="Mapa" options={[[undefined, "Campo aberto"], ...rings]} bind:value={ring} preview={ringPreview} />
            <RingPreview {ring} />
          {:else if editing === "player"}
            <TextField label="Nome do treinador" type="text" maxlength={12} bind:value={name} />
            <div class="flex items-end justify-between gap-3">
              <ChoiceGroup label="Personagem" options={[["male", "Menino"], ["female", "Menina"]]} bind:value={character} shortcut={TOGGLE} />
              <Sprite frame={trainerFrame(character === "male" ? 0 : 1)} scale={0.75} label={character === "male" ? "Menino" : "Menina"} />
            </div>
            {@render team("mine", "Seu time")}
          {:else}
            <ChoiceGroup label="Quem luta" options={[["wild", "Selvagens"], ["trainer", "Treinador"]]} bind:value={foeKind} />
            {#if foeKind === "wild"}
              <ChoiceGroup label="Os selvagens" options={[["ai", "Lutam com a IA"], ["idle", "Ficam parados"]]} bind:value={behavior} />
            {:else}
              <div class="flex items-end gap-3">
                <div class="min-w-0 flex-1"><SelectField label="Treinador" options={trainerOptions} bind:value={trainerId} preview={trainerPreview} /></div>
                {#if trainerInfo.get(trainerId)}<Sprite frame={trainerFrame(trainerInfo.get(trainerId)!.pic)} scale={0.75} />{/if}
              </div>
              <div>
                <Button disabled={!originals.has(trainerId)} onclick={() => (theirs = (originals.get(trainerId) ?? []).map((r) => ({ ...r })))}>Usar o time original</Button>
              </div>
            {/if}
            {@render team("theirs", foeKind === "wild" ? "Pokémon selvagens" : "Time do treinador")}
          {/if}
        </div>
        {#snippet footer()}
          <Button variant="primary" onclick={() => void closeEditor()}><span class="inline-flex items-center gap-1"><Glyph action={SAVE} round />Salvar</span></Button>
        {/snippet}
      </Panel>
    </div>
  {/if}

  {#if member}
    {@const row = rowsOf(member.side)[member.index]}
    {#if row}
      {@const error = rowError(row)}
      <!-- One member's fields over the editor: X or Back keeps them and returns to its card. -->
      <div class="fixed inset-0 z-10 grid place-items-center bg-overlay" use:menu={{ onBack: () => void closeMember(), onAction: (action) => action === SAVE && (void closeMember(), true) }}>
        <Panel title={names.species[row.species] ?? `#${row.species}`} class="max-h-[calc(100dvh-4rem)] w-[min(32rem,calc(100vw-2rem))]">
          <Card invalid={error !== undefined}>
            <div class="flex items-center gap-3">
              <Sprite frame={frontOf(row.species)} scale={1} label={names.species[row.species] ?? ""} />
              <div class="grid min-w-0 flex-1 grid-cols-[1fr_5rem] items-end gap-3">
                <SelectField label="Espécie" options={speciesOptions} bind:value={row.species} row={speciesRow} preview={speciesPreview} />
                <TextField label="Nível" type="number" min="1" max="100" bind:value={row.level} />
              </div>
            </div>
            {#each Array.from({ length: Math.min(4, moveIds(row.moves).length + 1) }, (_, k) => k) as k (k)}
              <SelectField
                label={`Golpe ${k + 1}`}
                options={k === 0 ? moveOptions : [[0, "—"], ...moveOptions]}
                bind:value={() => moveIds(row.moves)[k] ?? 0, (id: number) => setMove(row, k, id)}
                row={moveRow}
                preview={movePreview}
              />
            {/each}
            {#if error}<ErrorText>{error}</ErrorText>{/if}
          </Card>
          {#snippet footer()}
            <Button variant="primary" onclick={() => void closeMember()}><span class="inline-flex items-center gap-1"><Glyph action={SAVE} round />Salvar</span></Button>
          {/snippet}
        </Panel>
      </div>
    {/if}
  {/if}

  <nav class="grid w-[20rem] gap-3">
    <MenuCard title={TITLES.scene} bind:el={cards.scene} onclick={() => (editing = "scene")}>
      {#snippet media()}<RingPreview {ring} class="w-20" />{/snippet}
      <span class="truncate">{sceneName}</span>
    </MenuCard>
    <MenuCard title={TITLES.player} bind:el={cards.player} onclick={() => (editing = "player")}>
      {#snippet media()}<Sprite frame={trainerFrame(character === "male" ? 0 : 1)} scale={0.75} />{/snippet}
      <span>{name.trim() || "Sem nome"} · {character === "male" ? "Menino" : "Menina"}</span>
      <span class="truncate">{teamLine(mine)}</span>
      {#if playerError}<ErrorText role="status">{playerError}</ErrorText>{/if}
    </MenuCard>
    <MenuCard title={TITLES.foe} bind:el={cards.foe} onclick={() => (editing = "foe")}>
      {#snippet media()}
        {#if foeKind === "trainer" && trainerInfo.get(trainerId)}<Sprite frame={trainerFrame(trainerInfo.get(trainerId)!.pic)} scale={0.75} />
        {:else if theirs[0]}<Sprite frame={frontOf(theirs[0].species)} scale={0.75} />{/if}
      {/snippet}
      <span>{foeKind === "wild" ? `Selvagens · ${behavior === "ai" ? "lutam com a IA" : "ficam parados"}` : `Treinador · ${trainerInfo.get(trainerId)?.name ?? names.trainers[trainerId] ?? `nº ${trainerId}`}`}</span>
      <span class="truncate">{teamLine(theirs)}</span>
      {#if foeError}<ErrorText role="status">{foeError}</ErrorText>{/if}
    </MenuCard>
    <MenuCard title="Lutar" primary disabled={busy || blocker !== undefined} onclick={start} />
  </nav>

  <div class="absolute right-12 bottom-6"><KeyHints {hints} /></div>
</section>
