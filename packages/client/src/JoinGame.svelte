<script lang="ts">
  // Play, step 3 — Join: sessions found on the LAN, or an address typed in (spec 012 US5, spec 017 US2).
  import { parseAddress, type SessionListing } from "@soulsilver/shared/lan";
  import { onMount } from "svelte";
  import { t } from "./i18n";
  import { menu } from "./input/menu";

  let { onJoin, onBack, error, busy }: { onJoin: (address: string) => void; onBack: () => void; error: string | undefined; busy: boolean } = $props();

  let sessions = $state<SessionListing[]>([]);
  let address = $state("");
  const valid = $derived(parseAddress(address) !== undefined);

  onMount(() => window.soulSilver.watchSessions((list) => (sessions = list)));
</script>

<section use:menu={{ onBack }}>
  <h2>{t("join.title")}</h2>

  <h3>{t("join.lan")}</h3>
  {#if sessions.length === 0}
    <p role="status">{t("join.searching")}</p>
  {/if}
  <ul class="list-none p-0 grid gap-[0.4rem] max-w-[40rem]">
    {#each sessions as s (s.address + s.sessionId)}
      <li class="flex gap-[0.6rem] items-center">
        <button type="button" disabled={!s.joinable || busy} onclick={() => onJoin(s.address)}>
          {t("join.session", { host: s.hostName, players: s.players, max: s.maxPlayers, version: s.appVersion, address: s.address })}
        </button>
        {#if !s.joinable}<em>{s.reason}</em>{/if}
      </li>
    {/each}
  </ul>

  <h3>{t("join.byAddress")}</h3>
  <form class="flex gap-2 items-end mb-2"
    onsubmit={(event) => {
      event.preventDefault();
      if (valid) onJoin(address.trim());
    }}
  >
    <label class="grid gap-1">
      {t("join.hostIp")}
      <input bind:value={address} placeholder="192.168.0.10" autocomplete="off" aria-invalid={address.trim() !== "" && !valid} />
    </label>
    <button type="submit" disabled={!valid || busy}>{t("join.connect")}</button>
  </form>
  {#if address.trim() !== "" && !valid}<p class="text-danger">{t("join.invalidIp")}</p>{/if}

  {#if busy}<p role="status">{t("join.connecting")}</p>{/if}
  {#if error}<p class="text-danger" role="alert">{error}</p>{/if}
  <button type="button" onclick={onBack}>{t("common.back")}</button>
</section>
