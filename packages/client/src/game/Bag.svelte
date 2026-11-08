<script lang="ts">
  // Bag (spec 017, US5; spec 027): the original's pockets, switched with the tab actions. Every item that has a
  // field use can be used, and anything that is not a key item can be given to hold; the server decides each one.
  import { POCKET_KEYS, type ItemRecord } from "@soulsilver/shared/game-data";
  import { useEffectOf, type ItemEffects } from "@soulsilver/shared/items";
  import type { ServerMessage } from "@soulsilver/shared/game";
  import effectsJson from "../../../../content/items/effects.json";
  import Glyph from "../Glyph.svelte";
  import { t, type MessageKey } from "../i18n";
  import { menu } from "../input/menu";
  import PokemonIcon from "./PokemonIcon.svelte";

  type Member = { species: number; nickname?: string | undefined; level: number; hp: number; hpMax: number; held?: number | undefined; moves?: number[] | undefined };
  type Pots = Extract<ServerMessage, { type: "berry-pots" }>["pots"];

  let {
    bag,
    items,
    party,
    pots,
    apricorns,
    itemName,
    speciesName,
    moveName,
    onUse,
    onHold,
    onPlant,
    onHarvest,
    onBack,
  }: {
    bag: { item: number; count: number }[];
    items: Map<number, ItemRecord>;
    party: Member[];
    /** The Berry Pots as the server last sent them; undefined until they are opened. */
    pots: Pots | undefined;
    apricorns: number[] | undefined;
    itemName: (id: number) => string;
    speciesName: (id: number) => string;
    moveName: (id: number) => string;
    onUse: (item: number, partyIndex: number, moveIndex?: number) => void;
    onHold: (partyIndex: number, item: number | null) => void;
    onPlant: (pot: number, item: number) => void;
    onHarvest: (pot: number) => void;
    onBack: () => void;
  } = $props();

  const effects = (effectsJson as { value: ItemEffects }).value;
  const BERRY_POTS = 470;
  const APRICORN_BOX = 468;
  const DOWSING = 471;
  const RED_APRICORN = 485;
  /** Archetypes with a target on the field; the others are used straight away (Repel, key items). */
  const ON_MEMBER = new Set(["heal", "revive", "pp-up", "rare-candy", "evolve", "teach"]);
  const ON_MOVE = new Set(["pp-up"]);

  let pocket = $state<(typeof POCKET_KEYS)[number]>("items");
  /** What is being done with an item: choosing a member to use it on or to hold it, then a move, or a pot. */
  let step = $state<{ item: number; mode: "use" | "hold"; member?: number } | { pots: true } | { box: true } | undefined>();
  const inPocket = $derived(bag.filter((b) => (items.get(b.item)?.pocket ?? "items") === pocket));
  const effectOf = (id: number) => {
    const record = items.get(id);
    return record ? useEffectOf(record, effects) : undefined;
  };
  const usable = (id: number) => {
    if (id === BERRY_POTS || id === APRICORN_BOX || id === DOWSING) return true;
    const e = effectOf(id);
    return !!e && (ON_MEMBER.has(e.archetype) || e.archetype === "repel" || e.archetype === "escape-rope");
  };
  const holdable = (id: number) => items.get(id)?.pocket !== undefined && items.get(id)?.pocket !== "key-items";
  const berries = $derived(bag.filter((b) => items.get(b.item)?.pocket === "berries"));

  function use(id: number): void {
    if (id === BERRY_POTS) {
      onUse(id, 0);
      step = { pots: true };
    } else if (id === APRICORN_BOX) {
      onUse(id, 0);
      step = { box: true };
    } else if (ON_MEMBER.has(effectOf(id)?.archetype ?? "")) step = { item: id, mode: "use" };
    else onUse(id, 0);
  }

  function pickMember(i: number): void {
    if (!step || !("item" in step)) return;
    if (step.mode === "hold") {
      onHold(i, step.item);
      step = undefined;
    } else if (ON_MOVE.has(effectOf(step.item)?.archetype ?? "")) step = { ...step, member: i };
    else {
      onUse(step.item, i);
      step = undefined;
    }
  }

  function tab(by: number): void {
    pocket = POCKET_KEYS[(POCKET_KEYS.indexOf(pocket) + by + POCKET_KEYS.length) % POCKET_KEYS.length]!;
  }

  function onAction(action: string): boolean {
    if (step !== undefined) return false;
    if (action === "tabPrev") tab(-1);
    else if (action === "tabNext") tab(1);
    else return false;
    return true;
  }
  const backOut = () => (step !== undefined ? (step = undefined) : onBack());
</script>

<section use:menu={{ onBack: backOut, onAction }}>
  <h2>{t("bag.title")}</h2>
  {#if step === undefined}
    <div class="flex flex-wrap gap-[0.35rem] items-center mb-3" role="tablist">
      <Glyph action="tabPrev" />
      {#each POCKET_KEYS as key (key)}
        <button type="button" class="aria-selected:bg-accent aria-selected:text-[#111]" role="tab" aria-selected={pocket === key} tabindex="-1" onclick={() => (pocket = key)}>{t(`pocket.${key}`)}</button>
      {/each}
      <Glyph action="tabNext" />
    </div>
    {#if inPocket.length === 0}
      <p>{t("bag.empty")}</p>
    {:else}
      <ul class="list-none p-0 grid gap-[0.35rem] max-w-[30rem]">
        {#each inPocket as b (b.item)}
          <li class="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <span class="flex gap-3 justify-between"><span>{itemName(b.item)}</span><span>×{b.count}</span></span>
            <button type="button" disabled={!usable(b.item)} onclick={() => use(b.item)}>{t("bag.use")}</button>
            <button type="button" disabled={!holdable(b.item)} onclick={() => (step = { item: b.item, mode: "hold" })}>{t("bag.give")}</button>
          </li>
        {/each}
      </ul>
      {#if pocket === "balls"}<small class="text-muted">{t("bag.ballHint")}</small>{/if}
    {/if}
  {:else if "pots" in step}
    <h3>{t("bag.pots")}</h3>
    <ul class="list-none p-0 grid gap-[0.35rem] max-w-[30rem]">
      {#each pots ?? [null, null, null, null] as pot, i (i)}
        <li class="grid gap-[0.2rem]">
          {#if pot}
            <span>{itemName(pot.berry)} · {t(`bag.stage.${pot.stage}` as MessageKey)}</span>
            <button type="button" disabled={pot.stage !== "ripe"} onclick={() => onHarvest(i)}>{t("bag.harvest")}</button>
          {:else}
            <span class="text-muted">{t("bag.potEmpty")}</span>
            <span class="flex flex-wrap gap-1">
              {#each berries as b (b.item)}<button type="button" onclick={() => onPlant(i, b.item)}>{t("bag.plant", { item: itemName(b.item) })}</button>{/each}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if "box" in step}
    <h3>{t("bag.apricorns")}</h3>
    <ul class="list-none p-0 grid gap-[0.2rem]">
      {#each apricorns ?? [0, 0, 0, 0, 0, 0, 0] as n, i (i)}<li class="flex justify-between max-w-[20rem]"><span>{itemName(RED_APRICORN + i)}</span><span>×{n}</span></li>{/each}
    </ul>
  {:else if step.member !== undefined}
    <p>{t("bag.whichMove")}</p>
    <ul class="list-none p-0 grid gap-[0.35rem] max-w-[30rem]">
      {#each party[step.member]?.moves ?? [] as move, m (m)}
        <li>
          <button
            type="button"
            onclick={() => {
              if (step && "item" in step) onUse(step.item, step.member!, m);
              step = undefined;
            }}>{moveName(move)}</button
          >
        </li>
      {/each}
    </ul>
  {:else}
    <p>{step.mode === "use" ? t("bag.useOn", { item: itemName(step.item) }) : t("bag.giveTo", { item: itemName(step.item) })}</p>
    <ul class="list-none p-0 grid gap-[0.35rem] max-w-[30rem]">
      {#each party as m, i (i)}
        <li class="grid gap-[0.1rem]">
          <button type="button" class="flex gap-3 items-center justify-between" onclick={() => pickMember(i)}>
            <PokemonIcon species={m.species} />
            <span>{m.nickname ?? speciesName(m.species)}</span>
            <span>{m.hp}/{m.hpMax}</span>
          </button>
          {#if m.held !== undefined}
            <small class="flex gap-2 items-center">
              {t("bag.held", { item: itemName(m.held) })}
              {#if step.mode === "hold"}<button type="button" onclick={() => (onHold(i, null), (step = undefined))}>{t("bag.take", { item: itemName(m.held) })}</button>{/if}
            </small>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <button type="button" onclick={backOut}>{t("common.back")}</button>
</section>
