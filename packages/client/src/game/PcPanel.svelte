<script lang="ts">
  // Pokémon PC (spec 023, US3): the party beside one box at a time. Pick a Pokémon, then an empty
  // slot (or the party's end) to move it there; the server decides and answers with the boxes.
  // The Items tab moves bag items to the PC and back, one at a time (an addition, see balance-log).
  import Button from "../ui/Button.svelte";
  import type { PcSlot } from "@soulsilver/shared/game";
  import type { PartyMember, Save } from "@soulsilver/shared/save";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import PokemonIcon from "./PokemonIcon.svelte";

  let {
    boxes,
    party,
    pcItems,
    bag,
    refused,
    itemName,
    speciesName,
    moveName,
    natureName,
    onMove,
    onItem,
    onRename,
    onLeave,
  }: {
    boxes: Save["boxes"];
    pcItems: Save["pcItems"];
    bag: Save["bag"];
    itemName: (id: number) => string;
    party: { species: number; level: number; hp: number; hpMax: number; moves?: number[] | undefined; nature?: number | undefined }[];
    refused: string | undefined;
    speciesName: (id: number) => string;
    moveName: (id: number) => string;
    natureName: (id: number) => string;
    onMove: (from: PcSlot, to: PcSlot) => void;
    onItem: (dir: "deposit" | "withdraw", item: number) => void;
    onRename: (box: number, name: string) => void;
    onLeave: () => void;
  } = $props();

  let tab = $state<"pokemon" | "items">("pokemon");
  let box = $state(0);
  let held = $state<PcSlot | undefined>();
  let naming = $state<string | undefined>();
  const current = $derived(boxes[box]!);
  /** The Pokémon picked, for its summary. */
  const heldMon = $derived<Pick<PartyMember, "species" | "level" | "hp" | "moves" | "nature"> | undefined>(
    !held ? undefined : held.where === "party" ? (party[held.index] as never) : (boxes[held.box]?.slots[held.index] ?? undefined),
  );

  function pick(slot: PcSlot, filled: boolean): void {
    if (!held) {
      if (filled) held = slot;
      return;
    }
    // A plain copy: the reactive proxy cannot cross the IPC bridge.
    if (!filled) onMove($state.snapshot(held), slot);
    held = undefined;
  }

  function turn(step: number): void {
    box = (box + step + boxes.length) % boxes.length;
  }

  function onAction(action: string): boolean {
    if (naming !== undefined) return false;
    if (action === "tabPrev") turn(-1);
    else if (action === "tabNext") turn(1);
    else return false;
    return true;
  }
</script>

<section class="absolute inset-0 z-4 grid place-content-center p-4 bg-overlay text-primary" use:menu={{ onBack: () => (held ? (held = undefined) : onLeave()), onAction }}>
  <div class="grid gap-3 grid-cols-[minmax(10rem,auto)_minmax(18rem,auto)] max-w-[52rem]">
    <h2 class="m-0 col-span-2">{t("pc.title")}</h2>
    <div class="col-span-2 flex gap-2" role="tablist">
      <Button role="tab" variant="ghost" aria-selected={tab === "pokemon"} onclick={() => (tab = "pokemon")}>{t("pc.tabPokemon")}</Button>
      <Button role="tab" variant="ghost" aria-selected={tab === "items"} onclick={() => ((tab = "items"), (held = undefined))}>{t("pc.tabItems")}</Button>
    </div>
    {#if refused}<p class="m-0 col-span-2 text-danger font-bold" role="alert">{refused}</p>{/if}

    {#if tab === "items"}
      {#each [["pc.bag", bag, "deposit"], ["pc.stored", pcItems, "withdraw"]] as const as [title, list, dir] (dir)}
        <div class="grid gap-1 content-start">
          <h3 class="m-0">{t(title)}</h3>
          {#each list as s (s.item)}
            <Button variant="ghost" class="flex gap-3 justify-between" aria-label={t(dir === "deposit" ? "pc.depositOne" : "pc.withdrawOne", { item: itemName(s.item) })} onclick={() => onItem(dir, s.item)}>
              <span>{itemName(s.item)}</span><span>×{s.count}</span>
            </Button>
          {:else}
            <p class="m-0 text-secondary">{t("pc.noItems")}</p>
          {/each}
        </div>
      {/each}
    {:else}

    <div class="grid gap-1 content-start">
      <h3 class="m-0">{t("pc.party")}</h3>
      {#each party as m, i (i)}
        <Button variant="ghost" class={["flex gap-2 items-center", held?.where === "party" && held.index === i && "outline-2 outline-selected"]} onclick={() => pick({ where: "party", index: i }, true)}>
          <PokemonIcon species={m.species} /><span>{speciesName(m.species)}</span><span class="ml-auto">{t("pc.level", { level: m.level })}</span>
        </Button>
      {/each}
      {#if held && held.where === "box" && party.length < 6}
        <Button onclick={() => pick({ where: "party", index: party.length }, false)}>{t("pc.withdraw")}</Button>
      {/if}
    </div>

    <div class="grid gap-2 content-start">
      <div class="flex gap-2 items-center">
        <Button aria-label={t("pc.prevBox")} onclick={() => turn(-1)}>◀</Button>
        {#if naming === undefined}
          <Button class="grow" onclick={() => (naming = current.name)}>{current.name}</Button>
        {:else}
          <form class="grow flex gap-1" onsubmit={(e) => (e.preventDefault(), onRename(box, naming!), (naming = undefined))}>
            <input class="grow" aria-label={t("pc.boxName")} maxlength="8" bind:value={naming} />
            <Button type="submit">{t("pc.rename")}</Button>
          </form>
        {/if}
        <Button aria-label={t("pc.nextBox")} onclick={() => turn(1)}>▶</Button>
      </div>
      <div class="grid grid-cols-6 gap-1">
        {#each current.slots as m, i (i)}
          <Button
            variant="bare"
            class={["size-10 grid place-items-center rounded-full", held?.where === "box" && held.box === box && held.index === i && "outline-2 outline-selected"]}
            aria-label={m ? `${speciesName(m.species)} ${t("pc.level", { level: m.level })}` : t("pc.empty")}
            onclick={() => pick({ where: "box", box, index: i }, m !== null)}
          >
            {#if m}<PokemonIcon species={m.species} />{/if}
          </Button>
        {/each}
      </div>
    </div>

    {/if}
    {#if heldMon && tab === "pokemon"}
      <div class="col-span-2 grid gap-1 p-2 border border-default rounded" aria-live="polite">
        <strong>{speciesName(heldMon.species)} · {t("pc.level", { level: heldMon.level })}</strong>
        <span>{t("pc.hp", { hp: heldMon.hp })}{#if heldMon.nature !== undefined} · {natureName(heldMon.nature)}{/if}</span>
        <span>{(heldMon.moves ?? []).map(moveName).join(", ")}</span>
        <small class="text-secondary">{t("pc.moveHint")}</small>
      </div>
    {/if}
    <Button class="col-span-2" onclick={onLeave}>{t("pc.leave")}</Button>
  </div>
</section>
