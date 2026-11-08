<script lang="ts">
  // Play (spec 017, US2): save → mode → (Join) match. Replaces spec 012's temporary menu with the same logic.
  import type { SessionResult } from "@soulsilver/shared";
  import type { ArenaSpec } from "@soulsilver/shared/game";
  import type { SlotSummary } from "@soulsilver/shared/save";
  import { onMount } from "svelte";
  import ArenaSetup from "../ArenaSetup.svelte";
  import FirewallNotice from "../FirewallNotice.svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import JoinGame from "../JoinGame.svelte";
  import NewGame from "../NewGame.svelte";
  import type { PlayRequest } from "../play-request";
  import SaveSlots from "../SaveSlots.svelte";

  let { onPlay, onBack }: { onPlay: (play: PlayRequest) => void; onBack: () => void } = $props();

  type Step = "save" | "new" | "mode" | "firewall" | "join" | "arena";
  let step = $state<Step>("save");
  let slots = $state<SlotSummary[]>([]);
  let slot = $state<number | undefined>();
  let error = $state<string | undefined>();
  let busy = $state(false);

  const api = window.soulSilver;
  const chosen = $derived(slots.find((s) => s.index === slot));

  async function refresh(): Promise<void> {
    slots = await api.listSaves();
  }

  onMount(() => {
    void refresh();
  });

  function toMode(index: number): void {
    slot = index;
    error = undefined;
    step = "mode";
  }

  async function begin(start: (slot: number) => Promise<SessionResult>, address?: string, arena?: ArenaSpec, hosting = false): Promise<void> {
    if (slot === undefined || busy) return;
    busy = true;
    error = undefined;
    const at = slot;
    const result = await start(at);
    busy = false;
    if (result.ok) onPlay({ save: result.save, slot: at, ...(address ? { address } : {}), ...(arena ? { arena } : {}), ...(hosting ? { hosting } : {}) });
    else error = result.reason;
  }

  async function host(): Promise<void> {
    if (!(await api.getSettings()).firewallNoticeSeen) {
      step = "firewall";
      return;
    }
    step = "mode";
    await begin((s) => api.startHost(s), undefined, undefined, true);
  }

  async function firewallAccepted(): Promise<void> {
    await api.markFirewallNoticeSeen();
    await host();
  }
</script>

{#if step === "save"}
  <SaveSlots
    {slots}
    onPick={toMode}
    onNew={(index: number) => {
      slot = index;
      step = "new";
    }}
    onChanged={() => void refresh()}
    {onBack}
  />
{:else if step === "new" && slot !== undefined}
  <NewGame
    {slot}
    overwrite={chosen?.status !== "empty"}
    onCreated={(index: number) => {
      void refresh();
      toMode(index);
    }}
    onBack={() => (step = "save")}
  />
{:else if step === "mode"}
  <section use:menu={{ onBack: () => (step = "save") }}>
    <h2>{t("play.chooseMode")}</h2>
    {#if chosen?.status === "ok"}<p class="who">{t("play.playingAs", { name: chosen.name, slot: chosen.index })}</p>{/if}
    <nav class="grid gap-[0.6rem] max-w-[18rem]">
      <button type="button" disabled={busy} onclick={() => void begin((s) => api.startSolo(s))}>{t("play.solo")}</button>
      <button type="button" disabled={busy} onclick={() => void host()}>{t("play.host")}</button>
      <button type="button" disabled={busy} onclick={() => ((error = undefined), (step = "join"))}>{t("play.join")}</button>
      <button type="button" disabled={busy} onclick={() => ((error = undefined), (step = "arena"))}>{t("play.arena")}</button>
      <button type="button" onclick={() => (step = "save")}>{t("common.back")}</button>
    </nav>
    {#if busy}<p role="status">{t("play.starting")}</p>{/if}
    {#if error}<p class="text-danger" role="alert">{error}</p>{/if}
  </section>
{:else if step === "join"}
  <JoinGame {busy} {error} onJoin={(address: string) => void begin((s) => api.joinSession(s, address), address)} onBack={() => (step = "mode")} />
{:else if step === "arena"}
  <div use:menu={{ onBack: () => (step = "mode") }}>
    <ArenaSetup {busy} onStart={(spec: ArenaSpec) => void begin((s) => api.startSolo(s), undefined, spec)} onBack={() => (step = "mode")} />
    {#if error}<p class="text-danger" role="alert">{error}</p>{/if}
  </div>
{:else}
  <FirewallNotice onContinue={() => void firewallAccepted()} onBack={() => (step = "mode")} />
{/if}
