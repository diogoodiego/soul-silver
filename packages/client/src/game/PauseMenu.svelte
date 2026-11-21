<script lang="ts">
  // The Pokédex phone's apps (spec 017, US5–US7; block H): each page drawn on the phone's screen. Opening
  // the menu never pauses the shared world (FR-012); the phone's strip says so, and the others see the
  // player as busy.
  import Button from "../ui/Button.svelte";
  import type { ServerMessage } from "@soulsilver/shared/game";
  import type { ItemRecord } from "@soulsilver/shared/game-data";
  import type { Snippet } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import SaveApp from "../hud/SaveApp.svelte";
  import TrainerCard from "../hud/TrainerCard.svelte";
  import Settings from "../screens/Settings.svelte";
  import Bag from "./Bag.svelte";
  import FieldMenu from "./FieldMenu.svelte";
  import PartyMenu from "./PartyMenu.svelte";
  import Pokedex from "./Pokedex.svelte";
  import Gear from "../gear/Gear.svelte";
  import ClockTab from "../gear/ClockTab.svelte";

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
    clock,
    card,
    savedAt,
    leaving,
    online,
    onField,
    onPage,
    onLeave,
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
    /** The Clock app (spec 026, block H): the session's time, which only the host sets. */
    clock: { now: { minuteOfDay: number; weekday: number } | undefined; canSet: boolean; onSet: (minuteOfDay: number | null) => void };
    /** Block H: the Trainer Card, as the server last sent it. */
    card: Extract<ServerMessage, { type: "trainer-card" }> | undefined;
    /** Block H: when this client last wrote a save. */
    savedAt: Date | undefined;
    /** Saving and going back to the title. */
    leaving: boolean;
    /** The Online app's panel (spec 028), drawn by the game session, which holds its state. */
    online: Snippet;
    /** A field move or item: the menu closes before it is sent. */
    onField: (msg: object) => void;
    /** Another page, or undefined back to the home grid. */
    onPage: (page: MenuPage | undefined) => void;
    onLeave: () => void;
  } = $props();

  const send = (msg: unknown) => window.soulSilver.sendGame(msg);
  const back = () => onPage(undefined);
</script>

<div class="h-full px-3 py-2 text-primary">
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
  {:else if page === "trainer"}
    <TrainerCard {card} onRefresh={() => send({ type: "trainer-card-request" })} onBack={back} />
  {:else if page === "gear"}
    <Gear {...gear} onBack={back} />
  {:else if page === "clock"}
    <section class="grid gap-3" use:menu={{ onBack: back }}>
      <h2 class="m-0">{t("pause.clock")}</h2>
      {#if clock.now}<ClockTab {...clock.now} canSet={clock.canSet} onSet={clock.onSet} />{/if}
      <div><Button onclick={back}>{t("common.back")}</Button></div>
    </section>
  {:else if page === "field"}
    <FieldMenu {party} {bag} {riding} {onField} onBack={back} />
  {:else if page === "online"}
    <section class="grid gap-3" use:menu={{ onBack: back }}>
      <h2 class="m-0">{t("pause.online")}</h2>
      {@render online()}
      <Button class="justify-self-start" onclick={back}>{t("common.back")}</Button>
    </section>
  {:else if page === "save"}
    <SaveApp {savedAt} onSave={() => send({ type: "save-now" })} onBack={back} {leaving} {onLeave} />
  {:else if page === "settings"}
    <Settings embedded onRescue={() => send({ type: "rescue" })} onBack={back} />
  {/if}
</div>
