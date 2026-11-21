<script lang="ts">
  // Play (spec 017, US2): save → mode → (Join) match. Replaces spec 012's temporary menu with the same logic.
  import type { SessionResult } from "@soulsilver/shared";
  import type { SlotSummary } from "@soulsilver/shared/save";
  import { onMount } from "svelte";
  import FirewallNotice from "./FirewallNotice.svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import KeyHints from "../ui/KeyHints.svelte";
  import Button from "../ui/Button.svelte";
  import JoinGame from "./JoinGame.svelte";
  import NewGame from "./NewGame.svelte";
  import type { PlayRequest } from "../play-request";
  import SaveSlots from "./SaveSlots.svelte";

  let { onPlay, onBack }: { onPlay: (play: PlayRequest) => void; onBack: () => void } = $props();

  type Step = "save" | "new" | "mode" | "firewall" | "join";
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

  async function begin(start: (slot: number) => Promise<SessionResult>, address?: string, hosting = false): Promise<void> {
    if (slot === undefined || busy) return;
    busy = true;
    error = undefined;
    const at = slot;
    const result = await start(at);
    busy = false;
    if (result.ok) onPlay({ save: result.save, slot: at, ...(address ? { address } : {}), ...(hosting ? { hosting } : {}) });
    else error = result.reason;
  }

  async function host(): Promise<void> {
    if (!(await api.getSettings()).firewallNoticeSeen) {
      step = "firewall";
      return;
    }
    step = "mode";
    await begin((s) => api.startHost(s), undefined, true);
  }

  const hints = [
    { actions: ["confirm" as const], label: t("hints.select") },
    { actions: ["cancel" as const], label: t("hints.back") },
    { actions: ["up" as const, "down" as const], label: t("hints.navigate") },
  ];

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
  <!-- The main menu's look: right edge, vertically centred, over the title backdrop. -->
  <section class="fixed inset-0 flex flex-col items-end justify-center gap-2 pr-12 text-right" use:menu={{ onBack: () => (step = "save") }}>
    <h2 class="m-0 text-2xl">{t("play.chooseMode")}</h2>
    {#if chosen?.status === "ok"}<p class="m-0 mb-2 text-secondary">{t("play.playingAs", { name: chosen.name, slot: chosen.index })}</p>{/if}
    <nav class="flex flex-col items-end gap-1">
      <Button variant="menu" glyph="confirm" disabled={busy} onclick={() => void begin((s) => api.startSolo(s))}>{t("play.solo")}</Button>
      <Button variant="menu" glyph="confirm" disabled={busy} onclick={() => void host()}>{t("play.host")}</Button>
      <Button variant="menu" glyph="confirm" disabled={busy} onclick={() => ((error = undefined), (step = "join"))}>{t("play.join")}</Button>
      <Button variant="menu" glyph="confirm" onclick={() => (step = "save")}>{t("common.back")}</Button>
    </nav>
    {#if busy}<p role="status">{t("play.starting")}</p>{/if}
    {#if error}<p class="text-danger font-bold" role="alert">{error}</p>{/if}
    <div class="absolute right-12 bottom-6"><KeyHints {hints} /></div>
  </section>
{:else if step === "join"}
  <JoinGame {busy} {error} onJoin={(address: string, password: string) => void begin((s) => api.joinSession(s, address, password), address)} onBack={() => (step = "mode")} />
{:else}
  <FirewallNotice onContinue={() => void firewallAccepted()} onBack={() => (step = "mode")} />
{/if}
