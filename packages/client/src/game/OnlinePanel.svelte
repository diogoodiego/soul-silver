<script lang="ts">
  // The Online tab beside the game screen: who is in the session, opening a solo game to the LAN, and
  // leaving for another session (found on the LAN or typed in).
  import Button from "../ui/Button.svelte";
  import { parseAddress, type SessionListing } from "@soulsilver/shared/lan";
  import type { DuelRules } from "@soulsilver/shared/game";
  import { onMount } from "svelte";
  import { t } from "../i18n";
  import InviteHost from "./InviteHost.svelte";

  let {
    mode,
    players,
    me,
    address,
    addresses,
    busy,
    doing = {},
    error,
    onOpen,
    onJoin,
    onTrade,
    onDuel,
  }: {
    mode: "solo" | "host" | "guest" | "arena";
    /** `place`: the map's name once read; `area` (the map id) until then (spec 028.1). */
    players: { id: number; name: string; host: boolean; area: string; place?: string }[];
    /** This player's id in the session. */
    me: number | undefined;
    /** The host this guest is connected to. */
    address: string | undefined;
    /** Where friends join, once this PC opened its session to the LAN. */
    addresses: string[];
    busy: boolean;
    /** What players in view are doing (spec 028.1), by name; shortcut: matched by name, add the player id to the entity if names can repeat. */
    doing?: Record<string, string>;
    error: string | undefined;
    onOpen: () => void;
    onJoin: (address: string) => void;
    /** Spec 028.2: proposes a trade to this player; the server refuses one too far away. */
    onTrade?: (playerId: number) => void;
    /** Spec 028.5: invites this player to a duel with the rules chosen below the list. */
    onDuel?: (playerId: number, rules: DuelRules) => void;
  } = $props();

  let duelLevel = $state<DuelRules["level"]>("current");
  let duelTeam = $state(3);

  // R.5: opening the hosted port on the router (UPnP), so friends outside the LAN join by the public address.
  let internetAddress = $state<string | undefined>();
  let internetError = $state<string | undefined>();
  let openingInternet = $state(false);
  async function openInternet(): Promise<void> {
    openingInternet = true;
    internetError = undefined;
    const result = await window.soulSilver.openToInternet();
    openingInternet = false;
    if (result.ok) internetAddress = result.address;
    else internetError = result.reason;
  }

  let sessions = $state<SessionListing[]>([]);
  let typed = $state("");
  const valid = $derived(parseAddress(typed) !== undefined);

  // The callback returns nothing: a returned Svelte proxy cannot cross the context bridge ("could not be cloned").
  onMount(() =>
    window.soulSilver.watchSessions((list) => {
      sessions = list;
    }),
  );
</script>

<div class="grid content-start gap-4 p-4 overflow-y-auto text-primary">
  <p class="m-0 text-secondary">
    {#if mode === "solo"}{t("online.solo")}{:else if mode === "host"}{t("online.hosting")}{:else if mode === "guest"}{t("online.guest", { address: address ?? "" })}{:else}{t("online.arena")}{/if}
  </p>

  <section class="grid gap-2">
    <h3 class="m-0 text-[1rem]">{t("online.players", { n: players.length })}</h3>
    <ul class="list-none m-0 p-0 grid gap-1">
      {#each players as p (p.id)}
        <li class="flex gap-2 items-baseline px-3 py-2 rounded-[4px] bg-sunken">
          <strong>{p.name}</strong>
          {#if p.host}<span class="text-[0.8rem] text-primary">{t("online.host")}</span>{/if}
          <span class="text-[0.8rem] text-secondary">{p.place ?? p.area}</span>
          {#if p.id !== me && doing[p.name]}<span class="text-[0.8rem] text-secondary">{doing[p.name]}</span>{/if}
          {#if p.id === me}<span class="ml-auto text-[0.8rem] text-secondary">{t("online.you")}</span>{:else}
            {#if onTrade}<Button class="ml-auto" onclick={() => onTrade(p.id)}>{t("trade.propose")}</Button>{/if}
            {#if onDuel}<Button onclick={() => onDuel(p.id, { level: duelLevel, team: duelTeam })}>{t("duel.propose")}</Button>{/if}
          {/if}
        </li>
      {/each}
    </ul>
    {#if onDuel && players.length > 1}
      <div class="flex gap-3 items-center text-[0.9rem]">
        <label class="flex gap-1 items-center">{t("duel.level")}
          <select bind:value={duelLevel}>
            <option value="current">{t("duel.levelCurrent")}</option>
            <option value="50">{t("duel.level50")}</option>
          </select>
        </label>
        <label class="flex gap-1 items-center">{t("duel.team")}
          <select bind:value={duelTeam}>
            {#each [1, 2, 3, 4, 5, 6] as n (n)}<option value={n}>{n}</option>{/each}
          </select>
        </label>
      </div>
    {/if}
  </section>

  {#if mode === "solo"}
    <section class="grid gap-2">
      <Button class="justify-self-start" disabled={busy} onclick={onOpen}>{busy ? t("online.opening") : t("online.open")}</Button>
      <small class="text-secondary">{t("firewall.why")}</small>
    </section>
  {:else if mode === "host" && addresses.length > 0}
    <p class="m-0">{t("online.addresses", { addresses: addresses.join(", ") })}</p>
  {/if}
  {#if mode === "host"}
    <section class="grid gap-2">
      <h3 class="m-0 text-[1rem]">{t("online.internet")}</h3>
      {#if internetAddress}
        <p class="m-0" role="status">{t("online.internetAddress", { address: internetAddress })}</p>
      {:else}
        <small class="text-secondary">{t("online.internetNote")}</small>
        <Button class="justify-self-start" disabled={openingInternet} onclick={() => void openInternet()}>{openingInternet ? t("online.internetOpening") : t("online.internetOpen")}</Button>
      {/if}
      {#if internetError}<p class="m-0 text-danger" role="alert">{internetError}</p>{/if}
    </section>
    <InviteHost />
  {/if}

  {#if mode !== "arena"}
    <section class="grid gap-2">
      <h3 class="m-0 text-[1rem]">{t("online.join")}</h3>
      <small class="text-secondary">{t("online.joinNote")}</small>
      {#if sessions.length === 0}<p class="m-0 text-secondary" role="status">{t("join.searching")}</p>{/if}
      {#each sessions as s (s.address + s.sessionId)}
        <Button variant="ghost" class="text-left" disabled={!s.joinable || busy} onclick={() => onJoin(s.address)}>
          {t("join.session", { host: s.hostName, players: s.players, max: s.maxPlayers, version: s.appVersion, address: s.address })}
        </Button>
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
        <Button type="submit" disabled={!valid || busy}>{t("join.connect")}</Button>
      </form>
    </section>
  {/if}

  {#if error}<p class="m-0 text-danger font-bold" role="alert">{error}</p>{/if}
</div>
