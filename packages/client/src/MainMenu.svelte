<script lang="ts">
  // The start menu (spec 012): New game, Continue, Host, Join and Play alone.
  import type { SessionResult } from "@soulsilver/shared";
  import type { SlotSummary } from "@soulsilver/shared/save";
  import { onMount } from "svelte";
  import FirewallNotice from "./FirewallNotice.svelte";
  import JoinGame from "./JoinGame.svelte";
  import NewGame from "./NewGame.svelte";
  import type { PlayRequest } from "./play-request";
  import SaveSlots from "./SaveSlots.svelte";

  let { onPlay, notice }: { onPlay: (play: PlayRequest) => void; notice?: string | undefined } = $props();

  type Screen = "menu" | "new" | "continue" | "join" | "firewall";
  let screen = $state<Screen>("menu");
  let slots = $state<SlotSummary[]>([]);
  let selected = $state<number | undefined>();
  let error = $state<string | undefined>();
  let busy = $state(false);

  const api = window.soulSilver;
  const chosen = $derived(slots.find((s) => s.index === selected && s.status === "ok"));

  async function refresh(): Promise<void> {
    slots = await api.listSaves();
    if (selected !== undefined && slots.find((s) => s.index === selected)?.status !== "ok") selected = undefined;
  }

  onMount(() => {
    void refresh();
  });

  async function begin(start: () => Promise<SessionResult>, address?: string): Promise<void> {
    if (selected === undefined) return;
    busy = true;
    error = undefined;
    const slot = selected;
    const result = await start();
    busy = false;
    if (result.ok) onPlay({ save: result.save, slot, ...(address ? { address } : {}) });
    else error = result.reason;
  }

  async function host(): Promise<void> {
    if (selected === undefined) return;
    if (!(await api.getSettings()).firewallNoticeSeen) {
      screen = "firewall";
      return;
    }
    const slot = selected;
    await begin(() => api.startHost(slot));
  }

  async function firewallAccepted(): Promise<void> {
    await api.markFirewallNoticeSeen();
    screen = "menu";
    await host();
  }

  async function join(address: string): Promise<void> {
    const slot = selected;
    if (slot === undefined) return;
    await begin(() => api.joinSession(slot, address.trim()), address.trim());
  }
</script>

{#if screen === "menu"}
  <section>
    <h2>Menu</h2>
    {#if notice}<p role="status">{notice}</p>{/if}
    <p class="who" role="status">
      {#if chosen && chosen.status === "ok"}Jogando como <strong>{chosen.name}</strong> (slot {chosen.index}){:else}Escolha um save em Continuar ou comece um Novo jogo.{/if}
    </p>
    <div class="buttons">
      <button type="button" onclick={() => (screen = "new")}>Novo jogo</button>
      <button type="button" onclick={() => (screen = "continue")}>Continuar</button>
      <button type="button" disabled={!chosen || busy} onclick={() => void host()}>Hospedar</button>
      <button type="button" disabled={!chosen || busy} onclick={() => ((error = undefined), (screen = "join"))}>Entrar</button>
      <button type="button" disabled={!chosen || busy} onclick={() => void begin(() => api.startSolo(selected!))}>Jogar sozinho</button>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>
{:else if screen === "new"}
  <NewGame
    {slots}
    onCreated={(slot: number) => {
      selected = slot;
      void refresh();
      screen = "menu";
    }}
    onBack={() => (screen = "menu")}
  />
{:else if screen === "continue"}
  <SaveSlots {slots} {selected} onSelect={(slot: number) => ((selected = slot), (screen = "menu"))} onChanged={() => void refresh()} onBack={() => (screen = "menu")} />
{:else if screen === "join"}
  <JoinGame onJoin={(address: string) => void join(address)} onBack={() => (screen = "menu")} {error} />
{:else}
  <FirewallNotice onContinue={() => void firewallAccepted()} onBack={() => (screen = "menu")} />
{/if}

<style>
  .buttons {
    display: grid;
    gap: 0.5rem;
    max-width: 16rem;
  }
  .error {
    color: #b00020;
  }
</style>
