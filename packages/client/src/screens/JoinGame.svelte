<script lang="ts">
  // Play, step 3 — Join: sessions found on the LAN, or an address typed in (spec 012 US5, spec 017 US2).
  import Button from "../ui/Button.svelte";
  import { PEER_ADDRESS } from "@soulsilver/shared";
  import { parseAddress, type SessionListing } from "@soulsilver/shared/lan";
  import { onDestroy, onMount } from "svelte";
  import { t } from "../i18n";
  import { menu } from "../input/menu";
  import { answerInvite, bridge, type GuestAnswer } from "../net/peer";
  import { handToMain } from "../net/peer-link";
  import { settings } from "../settings";

  /** `password`: R.1, the room password typed below; empty when none. `address` is PEER_ADDRESS for an invite (R.3). */
  let { onJoin, onBack, error, busy }: { onJoin: (address: string, password: string) => void; onBack: () => void; error: string | undefined; busy: boolean } = $props();

  let sessions = $state<SessionListing[]>([]);
  let address = $state("");
  let password = $state("");
  const valid = $derived(parseAddress(address) !== undefined);

  // R.3: joining by invite code.
  let inviteCode = $state("");
  let answer = $state<GuestAnswer | undefined>();
  let answering = $state(false);
  let inviteError = $state<string | undefined>();
  let copied = $state(false);

  async function answerIt(): Promise<void> {
    answer?.cancel();
    answer = undefined;
    inviteError = undefined;
    copied = false;
    answering = true;
    try {
      const current = await answerInvite(inviteCode, $settings.stunServer);
      answer = current;
      const channel = await current.opened;
      const { port1, port2 } = new MessageChannel();
      bridge(channel, port1, () => current.cancel());
      handToMain(port2);
      onJoin(PEER_ADDRESS, password);
    } catch (e) {
      inviteError = (e as Error).message;
      answer = undefined;
    } finally {
      answering = false;
    }
  }

  async function copyAnswer(): Promise<void> {
    if (!answer) return;
    await navigator.clipboard.writeText(answer.code);
    copied = true;
  }

  // Leaving the screen before the host answered drops the half-made connection; a joined one is the session's now.
  onDestroy(() => {
    if (answering) answer?.cancel();
  });

  // The callback returns nothing: a returned Svelte proxy cannot cross the context bridge ("could not be cloned").
  onMount(() =>
    window.soulSilver.watchSessions((list) => {
      sessions = list;
    }),
  );
</script>

<section use:menu={{ onBack }}>
  <h2>{t("join.title")}</h2>

  <label class="grid gap-1 max-w-[20rem] mb-2">
    {t("join.password")}
    <input type="password" bind:value={password} maxlength="64" autocomplete="off" />
  </label>

  <h3>{t("join.lan")}</h3>
  {#if sessions.length === 0}
    <p role="status">{t("join.searching")}</p>
  {/if}
  <ul class="list-none p-0 grid gap-[0.4rem] max-w-[40rem]">
    {#each sessions as s (s.address + s.sessionId)}
      <li class="flex gap-[0.6rem] items-center">
        <Button disabled={!s.joinable || busy} onclick={() => onJoin(s.address, password)}>
          {t("join.session", { host: s.hostName, players: s.players, max: s.maxPlayers, version: s.appVersion, address: s.address })}
        </Button>
        {#if !s.joinable}<em>{s.reason}</em>{/if}
      </li>
    {/each}
  </ul>

  <h3>{t("join.byAddress")}</h3>
  <form class="flex flex-wrap gap-2 items-end mb-2"
    onsubmit={(event) => {
      event.preventDefault();
      if (valid) onJoin(address.trim(), password);
    }}
  >
    <label class="grid gap-1">
      {t("join.hostIp")}
      <input bind:value={address} placeholder="192.168.0.10" autocomplete="off" aria-invalid={address.trim() !== "" && !valid} />
    </label>
    <Button type="submit" disabled={!valid || busy}>{t("join.connect")}</Button>
  </form>
  {#if address.trim() !== "" && !valid}<p class="text-danger">{t("join.invalidIp")}</p>{/if}

  <h3>{t("join.invite")}</h3>
  <p class="text-secondary max-w-[40rem]">{t("join.inviteNote")}</p>
  <div class="grid gap-2 max-w-[40rem] mb-2">
    <label class="grid gap-1">
      {t("join.inviteCode")}
      <textarea class="text-xs break-all" rows="3" bind:value={inviteCode} spellcheck="false" disabled={answering}></textarea>
    </label>
    {#if !answer}
      <Button class="justify-self-start" disabled={inviteCode.trim() === "" || answering || busy} onclick={() => void answerIt()}>{answering ? t("join.answering") : t("join.answer")}</Button>
    {:else}
      <label class="grid gap-1">
        {t("join.answerCode")}
        <textarea class="text-xs break-all" rows="3" readonly value={answer.code}></textarea>
      </label>
      <Button class="justify-self-start" onclick={() => void copyAnswer()}>{copied ? t("invite.copied") : t("invite.copy")}</Button>
      {#if answering}<p class="m-0" role="status">{t("join.waitingHost")}</p>{/if}
    {/if}
    {#if inviteError}<p class="m-0 text-danger" role="alert">{inviteError}</p>{/if}
  </div>

  {#if busy}<p role="status">{t("join.connecting")}</p>{/if}
  {#if error}<p class="text-danger" role="alert">{error}</p>{/if}
  <Button onclick={onBack}>{t("common.back")}</Button>
</section>
