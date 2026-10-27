<script lang="ts">
  // The Online tab beside the game screen: who is in the session, opening a solo game to the LAN, and
  // leaving for another session (found on the LAN or typed in).
  import { parseAddress, type SessionListing } from "@soulsilver/shared/lan";
  import { onMount } from "svelte";
  import { t } from "../i18n";

  let {
    mode,
    players,
    me,
    address,
    addresses,
    busy,
    error,
    onOpen,
    onJoin,
  }: {
    mode: "solo" | "host" | "guest" | "arena";
    players: { id: number; name: string; host: boolean }[];
    /** This player's id in the session. */
    me: number | undefined;
    /** The host this guest is connected to. */
    address: string | undefined;
    /** Where friends join, once this PC opened its session to the LAN. */
    addresses: string[];
    busy: boolean;
    error: string | undefined;
    onOpen: () => void;
    onJoin: (address: string) => void;
  } = $props();

  let sessions = $state<SessionListing[]>([]);
  let typed = $state("");
  const valid = $derived(parseAddress(typed) !== undefined);

  onMount(() => window.soulSilver.watchSessions((list) => (sessions = list)));
</script>

<div class="grid content-start gap-4 p-4 overflow-y-auto text-[#eef]">
  <p class="m-0 text-muted">
    {#if mode === "solo"}{t("online.solo")}{:else if mode === "host"}{t("online.hosting")}{:else if mode === "guest"}{t("online.guest", { address: address ?? "" })}{:else}{t("online.arena")}{/if}
  </p>

  <section class="grid gap-2">
    <h3 class="m-0 text-[1rem]">{t("online.players", { n: players.length })}</h3>
    <ul class="list-none m-0 p-0 grid gap-1">
      {#each players as p (p.id)}
        <li class="flex gap-2 items-baseline px-3 py-2 rounded-[4px] bg-black/25">
          <strong>{p.name}</strong>
          {#if p.host}<span class="text-[0.8rem] text-focus">{t("online.host")}</span>{/if}
          {#if p.id === me}<span class="ml-auto text-[0.8rem] text-muted">{t("online.you")}</span>{/if}
        </li>
      {/each}
    </ul>
  </section>

  {#if mode === "solo"}
    <section class="grid gap-2">
      <button type="button" class="justify-self-start" disabled={busy} onclick={onOpen}>{busy ? t("online.opening") : t("online.open")}</button>
      <small class="text-muted">{t("firewall.why")}</small>
    </section>
  {:else if mode === "host" && addresses.length > 0}
    <p class="m-0">{t("online.addresses", { addresses: addresses.join(", ") })}</p>
  {/if}

  {#if mode !== "arena"}
    <section class="grid gap-2">
      <h3 class="m-0 text-[1rem]">{t("online.join")}</h3>
      <small class="text-muted">{t("online.joinNote")}</small>
      {#if sessions.length === 0}<p class="m-0 text-muted" role="status">{t("join.searching")}</p>{/if}
      {#each sessions as s (s.address + s.sessionId)}
        <button type="button" class="text-left" disabled={!s.joinable || busy} onclick={() => onJoin(s.address)}>
          {t("join.session", { host: s.hostName, players: s.players, max: s.maxPlayers, version: s.appVersion, address: s.address })}
        </button>
      {/each}
      <form
        class="flex gap-2 items-end"
        onsubmit={(event) => {
          event.preventDefault();
          if (valid) onJoin(typed.trim());
        }}
      >
        <label class="grid gap-1 flex-1">
          {t("join.hostIp")}
          <input class="[font:inherit]" bind:value={typed} placeholder="192.168.0.10" autocomplete="off" aria-invalid={typed.trim() !== "" && !valid} />
        </label>
        <button type="submit" disabled={!valid || busy}>{t("join.connect")}</button>
      </form>
    </section>
  {/if}

  {#if error}<p class="m-0 text-danger font-bold" role="alert">{error}</p>{/if}
</div>
