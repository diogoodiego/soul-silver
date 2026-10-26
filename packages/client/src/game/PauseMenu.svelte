<script lang="ts">
  // The in-game menu (spec 017, US5–US7): party, bag, Pokédex, settings and leaving. It never pauses
  // the shared world (FR-012); the banner says so, and the others see the player as busy.
  import type { ServerMessage } from "@soulsilver/shared/game";
  import type { ItemRecord } from "@soulsilver/shared/game-data";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import Controls from "../screens/Controls.svelte";
  import Settings from "../screens/Settings.svelte";
  import Bag from "./Bag.svelte";
  import PartyMenu from "./PartyMenu.svelte";
  import Pokedex from "./Pokedex.svelte";

  type Member = Extract<ServerMessage, { type: "party" }>["members"][number];

  let {
    party,
    bag,
    items,
    dex,
    names,
    leaving,
    onClose,
    onLeave,
  }: {
    party: Member[];
    bag: { item: number; count: number }[];
    items: Map<number, ItemRecord>;
    dex: { seen: number[]; caught: number[] };
    names: { species: (id: number) => string; move: (id: number) => string; item: (id: number) => string; nature: (id: number) => string; ability: (id: number) => string };
    leaving: boolean;
    onClose: () => void;
    onLeave: () => void;
  } = $props();

  type Page = "main" | "party" | "bag" | "dex" | "settings" | "controls";
  let page = $state<Page>("main");
  const send = (msg: unknown) => window.soulSilver.sendGame(msg);
</script>

<div class="absolute inset-0 grid grid-rows-[auto_1fr] justify-items-center p-4 bg-black/35 z-4 text-[#eef]">
  <p class="mt-0 mx-0 mb-3 px-3 py-1 rounded-full bg-[#b23b3b] text-[0.9rem]" role="status">{t("pause.live")}</p>
  <div class="self-start w-[min(100%,60rem)] max-h-[calc(100vh-5rem)] overflow-y-auto px-5 py-4 bg-panel border-2 border-accent rounded-[8px]">
    {#if page === "main"}
      <nav class="grid gap-2 max-w-[18rem]" use:menu={{ onBack: onClose, onAction: (a) => (a === "menu" ? (onClose(), true) : false) }}>
        <button type="button" onclick={() => (page = "party")}>{t("pause.party")}</button>
        <button type="button" onclick={() => (page = "bag")}>{t("pause.bag")}</button>
        <button type="button" onclick={() => (page = "dex")}>{t("pause.dex")}</button>
        <button type="button" onclick={() => (page = "settings")}>{t("pause.settings")}</button>
        <button type="button" disabled={leaving} onclick={onLeave}>{leaving ? t("pause.saving") : t("pause.leave")}</button>
        <button type="button" onclick={onClose}>{t("pause.resume")}</button>
      </nav>
    {:else if page === "party"}
      <PartyMenu
        {party}
        speciesName={names.species}
        moveName={names.move}
        natureName={names.nature}
        abilityName={names.ability}
        onReorder={(from: number, to: number) => send({ type: "reorder-party", from, to })}
        onBack={() => (page = "main")}
      />
    {:else if page === "bag"}
      <Bag {bag} {items} {party} itemName={names.item} speciesName={names.species} onUse={(item: number, partyIndex: number) => send({ type: "use-item", item, partyIndex })} onBack={() => (page = "main")} />
    {:else if page === "dex"}
      <Pokedex seen={dex.seen} caught={dex.caught} speciesName={names.species} onBack={() => (page = "main")} />
    {:else if page === "settings"}
      <Settings onControls={() => (page = "controls")} onBack={() => (page = "main")} />
    {:else}
      <Controls onBack={() => (page = "settings")} />
    {/if}
  </div>
</div>
