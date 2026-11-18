<script lang="ts">
  // The in-game menu's pages (spec 017, US5–US7): party, bag, Pokédex and settings, over the game
  // screen. The menu itself is the button panel beside the screen. It never pauses the shared world
  // (FR-012); the banner says so, and the others see the player as busy.
  import type { ServerMessage } from "@soulsilver/shared/game";
  import type { ItemRecord } from "@soulsilver/shared/game-data";
  import { t } from "../i18n";
  import Settings from "../screens/Settings.svelte";
  import Bag from "./Bag.svelte";
  import FieldMenu from "./FieldMenu.svelte";
  import PartyMenu from "./PartyMenu.svelte";
  import Pokedex from "./Pokedex.svelte";
  import Gear from "../gear/Gear.svelte";

  type Member = Extract<ServerMessage, { type: "party" }>["members"][number];
  import type { MenuPage } from "./menu-page";

  let {
    page,
    party,
    bag,
    items,
    dex,
    names,
    riding,
    pots,
    apricorns,
    gear,
    onField,
    onPage,
  }: {
    page: MenuPage;
    party: Member[];
    bag: { item: number; count: number }[];
    items: Map<number, ItemRecord>;
    dex: { seen: number[]; caught: number[] };
    names: { species: (id: number) => string; move: (id: number) => string; item: (id: number) => string; nature: (id: number) => string; ability: (id: number) => string };
    /** On the bicycle (spec 025). */
    riding: boolean;
    /** Spec 027: the Berry Pots and the Apricorn Box, as the server last sent them. */
    pots: Extract<ServerMessage, { type: "berry-pots" }>["pots"] | undefined;
    apricorns: number[] | undefined;
    /** The Pokégear's tabs, already in text (spec 026). */
    gear: Omit<import("svelte").ComponentProps<typeof Gear>, "onBack">;
    /** A field move or item: the menu closes before it is sent. */
    onField: (msg: object) => void;
    /** Another page, or undefined back to the button panel. */
    onPage: (page: MenuPage | undefined) => void;
  } = $props();

  const send = (msg: unknown) => window.soulSilver.sendGame(msg);
  const back = () => onPage(undefined);
</script>

<!-- The world keeps moving behind: only a light veil. -->
<div class="absolute inset-0 grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] justify-items-center p-4 bg-black/35 z-4 text-[#eef]">
  <p class="mt-0 mx-0 mb-3 px-3 py-1 rounded-full bg-[#b23b3b] text-[0.9rem]" role="status">{t("pause.live")}</p>
  <div class="self-start box-border w-full max-h-full overflow-auto px-5 py-4 bg-panel border-2 border-accent rounded-[8px]">
    {#if page === "party"}
      <PartyMenu
        {party}
        speciesName={names.species}
        moveName={names.move}
        natureName={names.nature}
        abilityName={names.ability}
        itemName={names.item}
        onReorder={(from: number, to: number) => send({ type: "reorder-party", from, to })}
        onBack={back}
      />
    {:else if page === "bag"}
      <Bag
        {bag}
        {items}
        {party}
        {pots}
        {apricorns}
        itemName={names.item}
        speciesName={names.species}
        moveName={names.move}
        onUse={(item: number, partyIndex: number, moveIndex?: number) => send({ type: "use-item", item, partyIndex, ...(moveIndex === undefined ? {} : { moveIndex }) })}
        onHold={(partyIndex: number, item: number | null) => send({ type: "set-held", partyIndex, item })}
        onPlant={(pot: number, item: number) => send({ type: "berry-plant", pot, item })}
        onHarvest={(pot: number) => send({ type: "berry-harvest", pot })}
        onBack={back}
      />
    {:else if page === "dex"}
      <Pokedex seen={dex.seen} caught={dex.caught} speciesName={names.species} onBack={back} />
    {:else if page === "gear"}
      <Gear {...gear} onBack={back} />
    {:else if page === "field"}
      <FieldMenu {party} {bag} {riding} {onField} onBack={back} />
    {:else if page === "settings"}
      <Settings onRescue={() => send({ type: "rescue" })} onBack={back} />
    {/if}
  </div>
</div>
